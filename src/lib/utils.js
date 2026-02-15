export const isNetworkError = (err) => {
    return err.name === 'TimeoutError' || 
           err.message?.includes('fetch') || 
           err.message?.includes('Abort') ||
           err.message?.includes('Load failed') ||
           err.message?.includes('Failed to fetch')
}

export const withTimeout = async (promise, ms = 45000) => {
    const t = new Promise((_, reject) => setTimeout(() => {
        const err = new Error('timeout')
        err.name = 'TimeoutError'
        reject(err)
    }, ms))
    return Promise.race([promise, t])
}

export const withRetry = async (fn, retries = 3, delay = 1000, onRetry = null) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn()
        } catch (err) {
            const isLastRetry = i === retries - 1
            const networkErr = isNetworkError(err)
            
            if (isLastRetry || !networkErr) throw err
            
            if (onRetry) onRetry(i + 1, err)
            
            await new Promise(r => setTimeout(r, delay * (i + 1))) // Exponential backoff
        }
    }
}
