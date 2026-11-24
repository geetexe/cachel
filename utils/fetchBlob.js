const allowedContentTypes = ['image/', 'video/', 'audio/', 'font/'];

// Error codes attached to fetch failures, so callers can tell them apart.
export const FETCH_ERROR_CODES = Object.freeze({
    FETCH_FAILED: 'fetch-failed',         // network error, CORS block, invalid URL, ...
    HTTP_ERROR: 'http-error',             // server answered with a non-2xx status
    UNSUPPORTED_TYPE: 'unsupported-type', // content-type missing or not an allowed media type
});

const fetchError = (message, code, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// Fetches a URL and returns its Blob. Throws an Error carrying a `code`
// (see FETCH_ERROR_CODES), plus `status` for HTTP errors and `contentType`
// for unsupported types.
const fetchBlob = async url => {
    let response;
    try{
        response = await fetch(url);
    }
    catch(err){
        throw fetchError(`cachel: failed to fetch [${url}] - ${err.message}`, FETCH_ERROR_CODES.FETCH_FAILED, { cause: err });
    }

    if(!response.ok){
        throw fetchError(
            `cachel: failed to fetch [${url}] - ${response.status} | ${response.statusText}`,
            FETCH_ERROR_CODES.HTTP_ERROR,
            { status: response.status }
        );
    }

    const contentType = response.headers.get('content-type');
    const isContentTypeAllowed = !!contentType && allowedContentTypes.some(type => contentType.startsWith(type));

    if(!isContentTypeAllowed){
        throw fetchError(
            `cachel: content type ${contentType} is not supported for ${url}`,
            FETCH_ERROR_CODES.UNSUPPORTED_TYPE,
            { contentType }
        );
    }

    try{
        return await response.blob();
    }
    catch(err){
        throw fetchError(`cachel: failed to read [${url}] - ${err.message}`, FETCH_ERROR_CODES.FETCH_FAILED, { cause: err });
    }
}

export default fetchBlob;
