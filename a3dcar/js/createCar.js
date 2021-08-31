async function loadMesh(meshNames, rootUrl, sceneFilename, scene){
    return await BABYLON.SceneLoader.ImportMeshAsync(meshNames, rootUrl, sceneFilename, scene).then(result=> result.meshes)
}