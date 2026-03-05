const convertToBlob = async url => {
    try{
        const response = await fetch(url);

        if(!response.ok){
            throw new Error(`cachel: failed to fetch [${url}] - ${response.status} | ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        const allowedContentTypes = ['image/', 'video/', 'audio/', 'font/'];
        const isContentTypeAllowed = allowedContentTypes.some(type => contentType.startsWith(type));

        if(!isContentTypeAllowed){
            throw new Error(`cachel: content type ${contentType} is not supported for ${url}`);
        }

        return await response.blob();
    }
    catch(err){
        console.error(err.message);
        return null;
    }
}

export default convertToBlob;