const chunkify = (arr, chunkSize) => arr.reduce((chunksArr, item, index) => {
    const chunkIndex = Math.floor(index/chunkSize);
    if(!chunksArr[chunkIndex]){
        chunksArr[chunkIndex] = [];
    }
    chunksArr[chunkIndex].push(item);
    return chunksArr;
}, []);

export default chunkify;