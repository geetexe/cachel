import Idb from "./lib/idb.js";
import { fetchBlob, chunkify, FETCH_ERROR_CODES } from './utils/index.js';

const BATCH_OPS = ['set', 'update', 'remove'];

// Trimmed non-empty string key, or null.
const normaliseKey = key => (typeof key === 'string' && key.trim()) || null;

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

class Cachel {
    
    static #instances = {};
    #idb;
    #defaultChunkSize = 8;
    #version = 0;
    #listeners = new Set();

    constructor(name = 'idb'){
        if(Cachel.#instances[name]) return Cachel.#instances[name];
        this.#idb = new Idb(name);
        Cachel.#instances[name] = this;
    }

    async load(url, { silent = false, meta = null } = {}){
        if(typeof url !== 'string') return;
        url = url.trim();
        if(!url) return;
        if(await this.#idb.has(url)) return;
        let blob;
        try{
            blob = await fetchBlob(url);
        }
        catch(err){
            console.error(err.message);
            // Same message as always; `code` and `cause` say what actually went wrong.
            const error = new Error(`cachel: caching failed for the requested resource - ${url}`, { cause: err });
            error.code = err.code ?? FETCH_ERROR_CODES.FETCH_FAILED;
            if(err.status !== undefined) error.status = err.status;
            if(err.contentType !== undefined) error.contentType = err.contentType;
            throw error;
        }
        try{
            const result = await this.#idb.set(url, blob, meta);
            !silent && this.#bump();
            return result;
        }
        catch(err){
            console.error(`cachel: error occurred while saving ${url} - ${err.message}`);
            return null;
        }
    }

    async get(url){
        if(typeof url !== 'string') return;
        url = url.trim();
        if(!url) return;
        const record = await this.#idb.get(url);
        if(!record) return null;
        const { blob, ...rest } = record;
        return {
            ...rest,
            size: blob?.size ?? 0,
            type: blob?.type ?? '',
            path: URL.createObjectURL(blob)
        };
    }

    // Like get(), but returns the Blob itself and creates no object URL.
    // Works where URL.createObjectURL is unavailable (e.g. service workers).
    async getBlob(key){
        key = normaliseKey(key);
        if(!key) return;
        const record = await this.#idb.get(key);
        if(!record) return null;
        return {
            ...record,
            size: record.blob?.size ?? 0,
            type: record.blob?.type ?? ''
        };
    }

    async has(key){
        key = normaliseKey(key);
        if(!key) return false;
        return this.#idb.has(key);
    }

    // Stores a Blob you already have under any string key, without fetching.
    // Overwrites an existing entry with the same key (unlike load()).
    async set(key, blob, { meta = null, silent = false } = {}){
        key = normaliseKey(key);
        if(!key) return;
        if(!(blob instanceof Blob)){
            throw new TypeError(`cachel: set() expects a Blob for ${key}`);
        }
        try{
            const result = await this.#idb.set(key, blob, meta);
            !silent && this.#bump();
            return result;
        }
        catch(err){
            console.error(`cachel: error occurred while saving ${key} - ${err.message}`);
            return null;
        }
    }

    // Every cached entry, read in a single transaction:
    // [{ url, meta, size, type }] and, with { blobs: true }, the blob as well.
    // No object URLs are created.
    async entries({ blobs = false } = {}){
        const records = await this.#idb.getAll();
        return records.map(({ blob, ...rest }) => ({
            ...rest,
            size: blob?.size ?? 0,
            type: blob?.type ?? '',
            ...(blobs ? { blob } : {})
        }));
    }

    // Applies several writes atomically, in order, in one transaction:
    // either all of them are saved or none are.
    //   { op: 'set', key, blob, meta? }   store a Blob (overwrites)
    //   { op: 'update', key, meta }       merge meta into an existing entry
    //   { op: 'remove', key }             delete an entry
    // Resolves with the number of operations applied, or null if the batch
    // failed and nothing was written. Throws TypeError for malformed operations
    // before touching the database.
    async batch(operations, { silent = false } = {}){
        if(!Array.isArray(operations)){
            throw new TypeError('cachel: batch() expects an array of operations');
        }
        const ops = operations.map((operation, index) => {
            const { op, blob, meta } = operation ?? {};
            const key = normaliseKey(operation?.key);
            if(!BATCH_OPS.includes(op)){
                throw new TypeError(`cachel: batch operation ${index} has an unknown op "${op}"; use ${BATCH_OPS.join(', ')}`);
            }
            if(!key){
                throw new TypeError(`cachel: batch operation ${index} (${op}) needs a non-empty string key`);
            }
            if(op === 'set' && !(blob instanceof Blob)){
                throw new TypeError(`cachel: batch operation ${index} (set ${key}) needs a Blob`);
            }
            if(op === 'update' && !isPlainObject(meta)){
                throw new TypeError(`cachel: batch operation ${index} (update ${key}) needs a meta object`);
            }
            return { op, key, blob, meta: meta ?? null };
        });
        if(!ops.length) return 0;
        try{
            const applied = await this.#idb.batch(ops);
            applied && !silent && this.#bump();
            return applied;
        }
        catch(err){
            console.error(`cachel: batch failed, no changes were made - ${err.message}`);
            return null;
        }
    }

    keys() {
        return this.#idb.keys();
    }

    delete() {
        return this.#idb.delete();
    }

    async remove(url){
        if(typeof url !== 'string') return;
        url = url.trim();
        if(!url) return;
        let result = null;
        try{
            result = await this.#idb.remove(url);
            this.#bump();
        } catch(err){
            console.error(`cachel: failed to remove ${url} - ${err.message}`);
        } finally{
            return result;
        }
    }

    async clear(){
        let result = null;
        try{
            result = await this.#idb.clear();
            this.#bump();
        } catch(err){
            console.error(`cachel: failed to clear - ${err.message}`);
        } finally {
            return result;
        }
    }

    async loadMany(urls, chunkSize = this.#defaultChunkSize){
        if(!(Array.isArray(urls) && urls.length)) return;
        if(chunkSize > this.#defaultChunkSize){
            console.warn(`cachel: supplied chunkSize is greater than max permissible chunk size; clamping the size to ${this.#defaultChunkSize}`);
        }
        chunkSize = Math.min(Math.max(1, chunkSize), this.#defaultChunkSize);
        const chunks = chunkify(urls, chunkSize);
        const results = [];
        const startTime = performance.now();
        for(const chunk of chunks){
            const chunkResults = await Promise.allSettled(chunk.map(url => this.load(url, { silent: true })));
            results.push(...chunkResults);
        }
        const timeElapsed = (performance.now() - startTime);
        const success = results.filter(result => result.status === 'fulfilled').length;
        const status = {
            results,
            success,
            failed: results.length - success,
            timeElapsed
        }
        success && this.#bump();
        return status;
    }

    #bump() {
        this.#version++;
        this.#notify();
    }

    onChange(callback){
        this.#listeners.add(callback);
        return () => this.#listeners.delete(callback);
    }

    #notify(){
        this.#listeners.forEach(callback => callback({
            version: this.#version, 
            timestamp: Date.now()
        }));
    }

    async updateRecord(url, meta){
        if(typeof url !== 'string') return;
        url = url.trim();
        if(!url) return;
        let result = null;
        try{
            result = await this.#idb.update(url, meta);
            this.#bump();
        } catch(err){
            console.error(`cachel: failed to update ${url} - ${err.message}`);
        } finally {
            return result;
        }
    }

    async checkStorage(){
        // globalThis, not window: also works in service workers and web workers
        const { storage } = globalThis.navigator || {};
        if(!storage) {
            console.error(`cachel: no storage found.`);
            return;
        }
        let result = null;
        try{
            const { quota, usage, usageDetails } = await storage.estimate();
            const percentUsed = +((usage/quota)*100).toFixed(2);
            result = {
                quota,
                usage,
                free: quota - usage,
                percentUsed,
                percentFree: 100 - percentUsed,
                indexedDBUsage: usageDetails?.indexedDB || 0
            }
        } catch(err){
            console.error(`cachel: failed to get the storage information - ${err.message}`);
        } finally {
            return result;
        }
    }

}

export default Cachel;
export { FETCH_ERROR_CODES };