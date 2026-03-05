import Idb from "./lib/idb.js";
import { convertToBlob, chunkify } from './utils/index.js';

class Cachel {
    
    static #instances = {};
    #idb;
    #defaultChunkSize = 8;

    constructor(name = 'idb'){
        if(Cachel.#instances[name]) return Cachel.#instances[name];
        this.#idb = new Idb(name);
        Cachel.#instances[name] = this;
    }

    async load(url){
        if(typeof url !== 'string') return;
        url = url.trim();
        if(!url) return;
        if(await this.#idb.has(url)) return;
        const blob = await convertToBlob(url);
        if(!blob){
            throw new Error(`cachel: caching failed for the requested resource - ${url}`);
        }
        try{
            const result = await this.#idb.set(url, blob);
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
        const blob = await this.#idb.get(url);
        if(!blob) return null;
        return URL.createObjectURL(blob);
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
        return this.#idb.remove(url);
    }

    async clear(){
        return this.#idb.clear();
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
            const chunkResults = await Promise.allSettled(chunk.map(url => this.load(url)));
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
        return status;
    }

}

export default Cachel;