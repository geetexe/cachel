import Idb from "./lib/idb.js";
import { convertToBlob, chunkify } from './utils/index.js';

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
        const blob = await convertToBlob(url);
        if(!blob){
            throw new Error(`cachel: caching failed for the requested resource - ${url}`);
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
            path: URL.createObjectURL(blob)
        };
    }

    async keys() {
        return this.#idb.keys();
    }

    async delete() {
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
        const { storage } = window.navigator || {};
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