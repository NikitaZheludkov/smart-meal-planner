import { ref } from 'vue'
import { parseAiDishResponse, normalizeAiIngredient, matchIngredientToProduct, toFormIngredient } from '../lib/aiIngredients'

const MAX_VOICE_RECORDING_MS = 12000

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const fetchWithTimeout = async (url, options = {}, timeoutMs = 45000) => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs)
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        })
    } finally {
        window.clearTimeout(timeoutId)
    }
}

const audioBufferTo16BitPCM = (audioBuffer) => {
    const numberOfChannels = Math.max(1, audioBuffer.numberOfChannels || 1)
    const length = audioBuffer.length || 0
    const result = new ArrayBuffer(length * 2)
    const view = new DataView(result)

    for (let i = 0; i < length; i++) {
        let sample = 0
        for (let ch = 0; ch < numberOfChannels; ch++) {
            sample += audioBuffer.getChannelData(ch)[i] || 0
        }
        sample /= numberOfChannels
        sample = Math.max(-1, Math.min(1, sample))
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    }

    return result
}

const resampleAudioBuffer = async (audioBuffer, targetSampleRate) => {
    const targetRate = Number(targetSampleRate) || 16000
    if (!audioBuffer || !audioBuffer.sampleRate || audioBuffer.sampleRate === targetRate) return audioBuffer

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
    if (!OfflineCtx) {
        throw new Error('OfflineAudioContext не поддерживается в этом браузере')
    }

    const length = Math.ceil(audioBuffer.duration * targetRate)
    const offlineContext = new OfflineCtx(1, length, targetRate)
    const source = offlineContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(offlineContext.destination)
    source.start(0)
    return await offlineContext.startRendering()
}

/**
 * Запись голоса → Yandex SpeechKit STT → YandexGPT → структурированные поля блюда.
 *
 * Ранее это жило прямо в DishDetailModal.vue вперемешку с формой блюда;
 * вынесено сюда, чтобы модалка отвечала только за форму, а запись/AI-разбор
 * можно было переиспользовать и тестировать отдельно.
 *
 * @param {Object} deps
 * @param {import('vue').Ref<boolean>} deps.isOpen - открыта ли форма (чтобы не применять результат после закрытия)
 * @param {(patch: { name?: string, description?: string, kcal?: number, protein?: number, fat?: number, carbs?: number }) => void} deps.onDishFields
 * @param {(ingredients: any[]) => void} deps.onIngredients
 * @param {() => Promise<any[]>} deps.getProducts - вернуть (при необходимости подгрузив) список продуктов для сопоставления ингредиентов
 * @param {(message: string, type?: string) => void} deps.showToast
 */
export function useVoiceDishInput({ isOpen, onDishFields, onIngredients, getProducts, showToast }) {
    const isRecordingVoice = ref(false)
    const isProcessingVoice = ref(false)
    const isAiNutritionEstimated = ref(false)

    let audioRecorder = null
    let audioChunks = []
    let mediaStream = null
    let voiceAutoStopTimeout = null
    let aiRequestId = 0
    let isDisposed = false

    const clearVoiceAutoStopTimeout = () => {
        if (voiceAutoStopTimeout) {
            window.clearTimeout(voiceAutoStopTimeout)
            voiceAutoStopTimeout = null
        }
    }

    const processAudioWithAI = async (audioBlob) => {
        const requestId = ++aiRequestId
        isProcessingVoice.value = true

        try {
            const yandexFolderId = import.meta.env.VITE_YANDEX_FOLDER_ID

            if (!yandexFolderId) {
                throw new Error('Не задан VITE_YANDEX_FOLDER_ID')
            }

            let recognizedText = ''

            try {
                let audioBuffer = null
                let lpcmData = null

                try {
                    const audioArrayBuffer = await audioBlob.arrayBuffer()
                    const AudioCtx = window.AudioContext || window.webkitAudioContext
                    if (!AudioCtx) {
                        throw new Error('AudioContext не поддерживается в этом браузере')
                    }
                    const audioContext = new AudioCtx()
                    try {
                        audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer.slice(0))
                    } finally {
                        await audioContext.close().catch(() => {})
                    }
                    audioBuffer = await resampleAudioBuffer(audioBuffer, 16000)
                    if (audioBuffer.sampleRate !== 16000) {
                        throw new Error(`Не удалось привести sampleRate к 16000Hz (получилось ${audioBuffer.sampleRate})`)
                    }
                    lpcmData = audioBufferTo16BitPCM(audioBuffer)
                } catch (e) {
                    console.error('Ошибка декодирования/конвертации аудио в LPCM:', e)
                    throw e
                }

                const sttUrl = new URL('/api/yandex-stt/speech/v1/stt:recognize', window.location.origin)
                sttUrl.searchParams.set('folderId', yandexFolderId)
                sttUrl.searchParams.set('lang', 'ru-RU')
                sttUrl.searchParams.set('topic', 'general')
                sttUrl.searchParams.set('format', 'lpcm')
                sttUrl.searchParams.set('sampleRateHertz', '16000')

                const sttRequest = async (attempt = 0) => {
                    const sttResponse = await fetchWithTimeout(sttUrl.toString(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/octet-stream'
                        },
                        body: lpcmData
                    }, 45000)

                    const sttRaw = await sttResponse.text()

                    if (!sttResponse.ok) {
                        const retryableTimeout = /timeout|i\/o timeout|timed out/i.test(sttRaw)
                        console.error('Yandex SpeechKit STT error:', sttResponse.status, sttRaw)
                        if (retryableTimeout && attempt === 0) {
                            await wait(700)
                            return sttRequest(1)
                        }
                        if (sttResponse.status === 400) {
                            showToast(retryableTimeout
                                ? 'Проблема сети при распознавании. Повторите фразу короче.'
                                : 'Не удалось распознать запись. Попробуйте ещё раз.'
                            , 'warn')
                        }
                        throw new Error(`Yandex SpeechKit STT error: ${sttResponse.status}`)
                    }

                    return sttRaw
                }

                const sttRaw = await sttRequest()

                let sttJson = null
                try {
                    sttJson = JSON.parse(sttRaw)
                } catch (e) {
                    sttJson = null
                }

                recognizedText = (sttJson?.result || '').toString().trim()

                if (!recognizedText) {
                    console.error('Yandex SpeechKit STT empty result:', sttRaw)
                    throw new Error('Yandex SpeechKit STT вернул пустой результат')
                }

                console.log('SpeechKit recognized text:', recognizedText)
            } catch (e) {
                console.error('SpeechKit STT request failed:', e)
                throw e
            }

            let yandexGptText = ''

            try {
                const gptResponse = await fetchWithTimeout('/api/yandex-llm/foundationModels/v1/completion', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        modelUri: `gpt://${yandexFolderId}/yandexgpt/latest`,
                        completionOptions: {
                            stream: false,
                            temperature: 0.2,
                            maxTokens: 2000
                        },
                        messages: [
                            {
                                role: 'system',
                                text: "Верни ответ строго в формате JSON: {'title':'Название','description':'Краткий рецепт','kcal':число,'protein':число,'fat':число,'carbs':число,'ingredients':[{'name':'продукт','amount':число,'unit':'строка'}]}. КБЖУ укажи для всего блюда целиком, без единиц измерения в значениях. Никакого лишнего текста."
                            },
                            {
                                role: 'user',
                                text: recognizedText
                            }
                        ]
                    })
                }, 45000)

                const gptRaw = await gptResponse.text()

                if (!gptResponse.ok) {
                    console.error('YandexGPT error:', gptResponse.status, gptRaw)
                    throw new Error(`YandexGPT error: ${gptResponse.status}`)
                }

                let gptJson = null
                try {
                    gptJson = JSON.parse(gptRaw)
                } catch (e) {
                    gptJson = null
                }

                yandexGptText = (
                    gptJson?.result?.alternatives?.[0]?.message?.text ||
                    gptJson?.result?.alternatives?.[0]?.text ||
                    gptJson?.alternatives?.[0]?.text ||
                    ''
                ).toString().trim()

                if (!yandexGptText) {
                    console.error('YandexGPT empty text:', gptRaw)
                    throw new Error('YandexGPT вернул пустой ответ')
                }
            } catch (e) {
                console.error('YandexGPT request failed:', e)
                throw e
            }

            let parsed = null
            try {
                parsed = parseAiDishResponse(yandexGptText)
            } catch (e) {
                console.error('Не удалось распарсить JSON от YandexGPT:', yandexGptText)
                throw e
            }

            const isStale = () => isDisposed || !isOpen.value || requestId !== aiRequestId
            if (isStale()) return

            const fieldsPatch = {}
            if (parsed.title) fieldsPatch.name = parsed.title
            if (parsed.description) fieldsPatch.description = parsed.description

            const hasAiNutrition = parsed.kcal !== null || parsed.protein !== null || parsed.fat !== null || parsed.carbs !== null
            if (parsed.kcal !== null) fieldsPatch.kcal = parsed.kcal
            if (parsed.protein !== null) fieldsPatch.protein = parsed.protein
            if (parsed.fat !== null) fieldsPatch.fat = parsed.fat
            if (parsed.carbs !== null) fieldsPatch.carbs = parsed.carbs
            isAiNutritionEstimated.value = hasAiNutrition

            if (Object.keys(fieldsPatch).length) onDishFields(fieldsPatch)

            if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
                const products = await getProducts()
                if (isStale()) return
                const aiIngredients = parsed.ingredients
                    .map((ing) => normalizeAiIngredient(ing))
                    .map((ing) => matchIngredientToProduct(ing, products))
                    .map((ing) => toFormIngredient(ing))
                onIngredients(aiIngredients)
            }

        } catch (error) {
            console.error('Ошибка обработки аудио (Yandex):', error)
            showToast('Не удалось обработать аудио', 'error')
        } finally {
            isProcessingVoice.value = false
        }
    }

    const toggleVoiceRecord = async () => {
        if (isRecordingVoice.value) {
            clearVoiceAutoStopTimeout()
            if (audioRecorder && audioRecorder.state !== 'inactive') {
                audioRecorder.stop()
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop())
            }
            isRecordingVoice.value = false
            return
        }

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            audioChunks = []

            const preferredMimeTypes = [
                'audio/ogg; codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/webm; codecs=opus',
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/wav'
            ]
            const selectedMimeType = preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
            audioRecorder = selectedMimeType ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType }) : new MediaRecorder(mediaStream)

            audioRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data)
                }
            }

            audioRecorder.onstop = () => {
                clearVoiceAutoStopTimeout()
                isRecordingVoice.value = false
                const blobType = audioRecorder.mimeType || audioChunks?.[0]?.type || selectedMimeType || 'application/octet-stream'
                const audioBlob = new Blob(audioChunks, { type: blobType })
                console.log('Audio recorded:', audioBlob.size, 'bytes', blobType)
                processAudioWithAI(audioBlob)

                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop())
                }
                mediaStream = null
            }

            audioRecorder.onerror = (event) => {
                console.error('Audio recording error:', event.error)
                clearVoiceAutoStopTimeout()
                isRecordingVoice.value = false
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop())
                }
                mediaStream = null
            }

            audioRecorder.start()
            isRecordingVoice.value = true
            clearVoiceAutoStopTimeout()
            voiceAutoStopTimeout = window.setTimeout(() => {
                if (audioRecorder && audioRecorder.state !== 'inactive') {
                    audioRecorder.stop()
                    showToast('Запись остановлена автоматически. Говорите короче, до 10-12 секунд.', 'warn')
                }
            }, MAX_VOICE_RECORDING_MS)

        } catch (error) {
            console.error('Failed to access microphone:', error)
            showToast('Не удалось получить доступ к микрофону', 'error')
        }
    }

    // Останавливает запись/микрофон при размонтировании владеющего компонента,
    // чтобы модалка не продолжала слушать микрофон после закрытия.
    const dispose = () => {
        isDisposed = true
        aiRequestId += 1
        clearVoiceAutoStopTimeout()
        if (audioRecorder && audioRecorder.state !== 'inactive') {
            try { audioRecorder.stop() } catch {}
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop())
            mediaStream = null
        }
    }

    return {
        isRecordingVoice,
        isProcessingVoice,
        isAiNutritionEstimated,
        toggleVoiceRecord,
        dispose
    }
}
