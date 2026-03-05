import promisify from "../utils/promisify.js";

class Idb {
    #name = null;
    #db = null;
    #storeName = 'assets';
    #ready = null;

    constructor(idbName){
        this.#name = `cachel:${idbName}`;
        this.#ready = this.#init();
    }

    async #init(){
        try {
            const request = indexedDB.open(this.#name, 1);
            request.onupgradeneeded = e => {
                const db = e.target.result;
                if(!db.objectStoreNames.contains(this.#storeName)){
                    db.createObjectStore(this.#storeName, { keyPath: 'url' });
                }
            };
            this.#db = await promisify(request);
        }
        catch(err) {
            console.warn(`cachel: failed to initialise IndexedDB - ${err.message}`);
        }
    }

    async #isReady(){
        await this.#ready;
        return !!this.#db;
    }

    #getStoreRef(permission = 'readonly'){
        return this.#db.transaction(this.#storeName, permission).objectStore(this.#storeName);
    }

    async set(url, blob){
        if(!await this.#isReady()) return;
        const store = this.#getStoreRef('readwrite');
        return promisify(store.put({ url, blob }));
    }

    async get(url){
        if(!await this.#isReady()) return null;
        try{
            const store = this.#getStoreRef();
            const record = await promisify(store.get(url));
            return record ? record.blob : null;
        }
        catch(err){
            console.error(err.message);
            return null;
        }
    }

    async has(url) {
        if(!await this.#isReady()) return false;
        try{
            const store = this.#getStoreRef();
            const record = await promisify(store.get(url));
            return !!record;
        }
        catch(err){
            console.error(`cachel: failed to access ${url} - ${err.message}`);
            return false;
        }
    }

    async remove(url){
        if(!await this.#isReady()) return;
        try{
            const store = this.#getStoreRef('readwrite');
            return await promisify(store.delete(url));
        }
        catch(err){
            console.error(`cachel: failed to remove ${url} - ${err.message}`);
            return null;
        }
    }

    async clear() {
        if(!await this.#isReady()) return;
        try{
            const store = this.#getStoreRef('readwrite');
            return await promisify(store.clear());
        }
        catch(err){
            console.error(`cachel: failed to clear - ${err.message}`);
            return null;
        }
    }

    async delete(){
        if(!await this.#isReady()) return;
        try{
            this.#db.close();
            return await promisify(indexedDB.deleteDatabase(this.#name));
        }
        catch(err){
            console.error(`cachel: failed to delete ${this.#name} - ${err.message}`);
            return null;
        }
    }

    async keys(){
        if(!await this.#isReady()) return [];
        try{
            const store = this.#getStoreRef();
            return await promisify(store.getAllKeys());
        }
        catch(err){
            console.error(`cachel: failed to get keys - ${err.message}`);
            return [];
        }
    }
    
}

export default Idb;