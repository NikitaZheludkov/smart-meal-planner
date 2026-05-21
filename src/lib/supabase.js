import PocketBase from 'pocketbase'

export const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://147.45.161.168'

export const pb = new PocketBase(pocketbaseUrl)
pb.autoCancellation(false)

export const supabase = pb
