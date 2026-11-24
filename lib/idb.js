import { promisify } from "../utils/index.js";

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

    async set(url, blob, meta = null){
        if(!await this.#isReady()) return;
        const store = this.#getStoreRef('readwrite');
        return promisify(store.put({ url, blob, meta }));
    }

    // Read and write in one transaction, so concurrent updates to the same
    // key cannot overwrite each other.
    async update(key, updatedMeta){
        if(!await this.#isReady()) return;
        const store = this.#getStoreRef('readwrite');
        return new Promise((resolve, reject) => {
            const getRequest = store.get(key);
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => {
                const record = getRequest.result;
                if(!record) return resolve(null);
                const meta = { ...record.meta, ...updatedMeta };
                const putRequest = store.put({ ...record, meta });
                putRequest.onerror = () => reject(putRequest.error);
                putRequest.onsuccess = () => resolve(putRequest.result);
            };
        });
    }

    async getAll(){
        if(!await this.#isReady()) return [];
        try{
            const store = this.#getStoreRef();
            return await promisify(store.getAll());
        }
        catch(err){
            console.error(`cachel: failed to read records - ${err.message}`);
            return [];
        }
    }

    // Applies operations in order inside one readwrite transaction.
    // Resolves with the number of operations once committed; rejects (and
    // nothing is written) if any operation fails.
    // ops: [{ op: 'set', key, blob, meta } | { op: 'update', key, meta } | { op: 'remove', key }]
    async batch(ops){
        if(!await this.#isReady()) return;
        return new Promise((resolve, reject) => {
            const transaction = this.#db.transaction(this.#storeName, 'readwrite');
            const store = transaction.objectStore(this.#storeName);
            let failure = null;

            transaction.oncomplete = () => resolve(ops.length);
            transaction.onabort = () => reject(failure || transaction.error || new Error('cachel: batch was aborted'));

            const abort = err => {
                failure = err;
                try { transaction.abort(); } catch { /* already finished */ }
            };

            // Each operation starts only after the previous one succeeded,
            // which keeps them strictly in order. Request errors abort the
            // transaction on their own.
            const run = index => {
                if(index >= ops.length) return; // nothing left: the transaction commits
                const { op, key, blob, meta } = ops[index];
                try{
                    if(op === 'set'){
                        store.put({ url: key, blob, meta: meta ?? null }).onsuccess = () => run(index + 1);
                    }
                    else if(op === 'remove'){
                        store.delete(key).onsuccess = () => run(index + 1);
                    }
                    else if(op === 'update'){
                        const getRequest = store.get(key);
                        getRequest.onsuccess = () => {
                            const record = getRequest.result;
                            if(!record) return abort(new Error(`cachel: cannot update ${key}, it is not cached`));
                            try{
                                store.put({ ...record, meta: { ...record.meta, ...meta } }).onsuccess = () => run(index + 1);
                            }
                            catch(err){
                                abort(err);
                            }
                        };
                    }
                }
                catch(err){
                    abort(err);
                }
            };
            run(0);
        });
    }

    async get(url){
        if(!await this.#isReady()) return null;
        try{
            const store = this.#getStoreRef();
            const record = await promisify(store.get(url));
            return record || null;
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