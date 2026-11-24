import fetchBlob from './fetchBlob.js';

// Kept for backwards compatibility: logs and returns null on any failure.
// New code should use fetchBlob, which throws errors carrying a `code`.
const convertToBlob = async url => {
    try{
        return await fetchBlob(url);
    }
    catch(err){
        console.error(err.message);
        return null;
    }
}

export default convertToBlob;
