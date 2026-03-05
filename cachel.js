import Idb from "./lib/idb.js";
import convertToBlob from './utils/blob.js';

class Cachel {
    #idb;
    constructor(name = 'idb'){
        this.#idb = new Idb(name);
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
}

export default Cachel;