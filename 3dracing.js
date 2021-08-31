// ==UserScript==
// @name         3d racing
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  3d racing
// @author       You
// @match        https://www.torn.com/loader.php?sid=racing
// @icon         https://www.google.com/s2/favicons?domain=torn.com
// @grant        GM_getResourceURL
// @grant        GM_getResourceText
// @require      https://cdn.babylonjs.com/babylon.js
// @require      https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js
// @resource     city_scene  https://raw.githubusercontent.com/MiniAlfa/torn-racinvisuals/master/encoded-20210824062716.txt
/* globals BABYLON, waitForKeyElements */
///*eslint no-multi-spaces: "off"*/
// ==/UserScript==

async function loadMesh(meshNames, rootUrl, sceneFilename, scene){
    return await BABYLON.SceneLoader.ImportMeshAsync(meshNames, rootUrl, sceneFilename, scene).then(result=> result.meshes)
}

function pr(thing){
    console.log(thing);
}

function hasClass(element, className) {
    return (' ' + element.className + ' ').indexOf(' ' + className+ ' ') > -1;
}


function getBaseLog(x, y) {
    return Math.log(y) / Math.log(x);
}

function Wrap(x,x_min,x_max){
    return (x - (x_max - x_min) * Math.floor( x / (x_max - x_min)));
}

var showPath3D = function(path3d, size, scene) {
    size = size || 0.5;
    var curve = path3d.getCurve();
    var tgts = path3d.getTangents();
    var norms = path3d.getNormals();
    var binorms = path3d.getBinormals();
    var vcTgt, vcNorm, vcBinorm;
    var line = BABYLON.Mesh.CreateLines("curve", curve, scene);
    for (var i = 0; i < curve.length; i++) {
        vcTgt = BABYLON.Mesh.CreateLines("tgt"+i, [curve[i], curve[i].add(tgts[i].scale(size))], scene);
        vcNorm = BABYLON.Mesh.CreateLines("norm"+i, [curve[i], curve[i].add(norms[i].scale(size))], scene);
        vcBinorm = BABYLON.Mesh.CreateLines("binorm"+i, [curve[i], curve[i].add(binorms[i].scale(size))], scene);
        vcTgt.color = BABYLON.Color3.Red();
        vcNorm.color = BABYLON.Color3.Green();
        vcBinorm.color = BABYLON.Color3.Blue();
    }
};



/*
 (c) 2011-2015, Vladimir Agafonkin
 SunCalc is a JavaScript library for calculating sun/moon position and light phases.
 https://github.com/mourner/suncalc
*/

var PI   = Math.PI,
    sin  = Math.sin,
    cos  = Math.cos,
    tan  = Math.tan,
    asin = Math.asin,
    atan = Math.atan2,
    acos = Math.acos,
    rad  = PI / 180;

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


// date/time constants and conversions
var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j)  { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date)   { return toJulian(date) - J2000; }

// general calculations for position
var e = rad * 23.4397; // obliquity of the Earth

function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)) ;}
function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)) ;}

function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) ;}
function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)) ;}

function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw ;}

// general sun calculations
function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d) ;}

function eclipticLongitude(M) {

    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
        P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + PI;
}

function sunCoords(d) {

    var M = solarMeanAnomaly(d),
        L = eclipticLongitude(M);

    return {
        dec: declination(L, 0),
        ra: rightAscension(L, 0)
    };
}


var SunCalc = {};


// calculates sun position for a given date and latitude/longitude

var getSunPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c  = sunCoords(d),
        H  = siderealTime(d, lw) - c.ra;

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: altitude(H, phi, c.dec)
    };
};

function createTextPlane(text, scene){
    var textPlane = BABYLON.Mesh.CreatePlane("textPlane", 15, scene, false);
    textPlane.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
    textPlane.material = new BABYLON.StandardMaterial("textPlane", scene);

    var textPlaneTexture = new BABYLON.DynamicTexture("dynamic texture", 512, scene, true);
    textPlane.material.diffuseTexture = textPlaneTexture;
    textPlane.material.diffuseTexture.hasAlpha = true;
    textPlane.useAlphaFromDiffuseTexture = true;
    textPlane.material.specularColor = new BABYLON.Color3(0, 0, 0);
    textPlane.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
    textPlane.material.backFaceCulling = false;

    textPlaneTexture.drawText(text, null, 240, "bold 20px verdana", "white", "#00000000");
    textPlane.material.freeze();

    return textPlane;
}


(function() {
    'use strict';
    var totalDistance = 0;
    window.MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
    var leaderBoard = document.getElementById('leaderBoard');
    let lapnumber = prompt("number of laps:",10);
    var players = [...leaderBoard.childNodes].map(a=>{
        var playerNode = a.children[0];
        var name = playerNode.getElementsByClassName('name')[0].innerText;
        var carNode = playerNode.getElementsByClassName('car')[0].firstElementChild;
        var carName = carNode.title;
        var timeNode = playerNode.getElementsByClassName('time')[0];
        var obj = {
            'id':a.id,
            'fullNode': a,
            'node': playerNode,
            'carNode':carNode,
            'name':name,
            'car':carName,
            'speed':0,
            'mesh':null,
            'traveled':0,
            'precentage':0,
            'updateObj':{
                'precent':0,
                'timestamp':+new Date()
            },
            'offset': (Math.random() * 10 | 0) -5
        }

        let observer = new MutationObserver(function(mutations, observer) {
            // fired when a mutation occurs
            let timeText = timeNode.innerHTML;
            if(!timeText.includes("%")){
                obj.updateObj.precent = Math.round(obj.updateObj.precent);
                return
            }

            let strnumber = timeNode.innerHTML.replace("%","");
            let precentage = parseFloat(strnumber)/100 * lapnumber;
            let timestamp = +new Date();
            let prevPrecentage = obj.updateObj.precent;
            if(prevPrecentage !== precentage){
                let prevTimestamp = obj.updateObj.timestamp;
                obj.updateObj.precent = precentage;
                obj.updateObj.timestamp = timestamp;
                let delta = timestamp - prevTimestamp;
                let deltaPrecentage = precentage - obj.precentage;
                obj.speed = deltaPrecentage/delta;

            }

        });

        // define what element should be observed by the observer
        // and what types of mutations trigger the callback
        observer.observe(timeNode, {
            childList: true
        });

        return obj;

    });

    setTimeout(delayedStuff,1000);
    function delayedStuff(){

        var racingContainer = document.getElementById('mainContainer');
        var canvas = document.createElement('canvas');
        canvas.id = "renderCanvas";
        canvas.style =`width: 100%;
                height: 100%;
                touch-action: none;`

        racingContainer.appendChild(canvas);


        async function createScene(engine, canvas) {
            var scene = new BABYLON.Scene(engine);

            var date = new Date;
            var minutes = date.getMinutes() + date.getHours() * 60;

            // Sky material
            var skyboxMaterial = new BABYLON.StandardMaterial("myMaterial", scene);
            skyboxMaterial.backFaceCulling = false;
            var sunPos = getSunPosition(new Date(), 29.47551598095879, -94.77126828871418);
            let y = sin(sunPos.altitude)*10;
            let x = sin(2*sunPos.azimuth)*10;
            let z = sin(2*sunPos.azimuth+Math.PI/2)*10;

            var sunLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(x, y, z), scene);
            sunLight.diffuse = new BABYLON.Color3(1, 1, 1);
            sunLight.specular = new BABYLON.Color3(0.9, 0.8, 1);
            sunLight.groundColor = new BABYLON.Color3(0, 0, 0);

            var Inclination = sunPos.altitude/(Math.PI) - 0.5;
            sunLight.intensity = Math.max(Inclination,0.1);
            skyboxMaterial.inclination = Inclination;
            skyboxMaterial.azimuth = sunPos.azimuth/Math.PI;
            skyboxMaterial.luminance = 1;
            skyboxMaterial.turbidity = 5;

            // camera
            var camera = new BABYLON.ArcRotateCamera("camera1", 0, 0, 0, new BABYLON.Vector3(0, 0, 0), scene);
            camera.setPosition(new BABYLON.Vector3(-5, 10, -10));
            camera.attachControl(canvas, true);

            /*-----------------------Path------------------------------------------*/

            // Craete array of points to describe the curve
            var points = [
                [-431.50973320007324,0.0,45.85435092449188],[-438.5129451751709,0.0,59.3533456325531],[-445.2117443084717,0.0,74.00214672088623],[-448.4896183013916,0.0,82.0556104183197],[-454.37378883361816,0.0,98.42626452445984],[-456.48298263549805,0.0,105.39542436599731],[-458.1578254699707,0.0,112.05191612243652],[-459.4858646392822,0.0,118.78619194030762],[-460.5546474456787,0.0,125.98868608474731],[-462.7588748931885,0.0,147.11230993270874],[-462.86330223083496,0.0,149.48420524597168],[-462.8671169281006,0.0,151.84515714645386],[-462.74962425231934,0.0,154.22484874725342],[-462.490177154541,0.0,156.6529631614685],[-462.0680332183838,0.0,159.15919542312622],[-461.46249771118164,0.0,161.77321672439575],[-460.6529235839844,0.0,164.5246982574463],[-459.7698211669922,0.0,167.02048778533936],[-458.8137626647949,0.0,169.3075180053711],[-457.7824592590332,0.0,171.41767740249634],[-456.67362213134766,0.0,173.38286638259888],[-455.4850101470947,0.0,175.23497343063354],[-454.21433448791504,0.0,177.00588703155518],[-452.8593063354492,0.0,178.72750759124756],[-451.4176845550537,0.0,180.43171167373657],[-442.9148197174072,0.0,189.60870504379272],[-441.1308288574219,0.0,191.30560159683228],[-439.3765449523926,0.0,192.83974170684814],[-437.6406669616699,0.0,194.24785375595093],[-426.9778251647949,0.0,202.10747718811035],[-425.0537395477295,0.0,203.6621332168579],[-406.3730239868164,0.0,220.4906940460205],[-394.64757442474365,0.0,232.07659721374512],[-357.928466796875,0.0,273.9058017730713],[-348.6767530441284,0.0,285.6969356536865],[-339.7570848464966,0.0,298.2767105102539],[-335.2978229522705,0.0,305.1187753677368],[-326.13251209259033,0.0,320.42016983032227],[-322.68452644348145,0.0,326.9140958786011],[-319.8017120361328,0.0,333.16848278045654],[-317.36886501312256,0.0,339.22998905181885],[-307.9223394393921,0.0,368.2769298553467],[-305.7701826095581,0.0,374.1607427597046],[-303.2616376876831,0.0,380.17821311950684],[-300.2814769744873,0.0,386.3759756088257],[-283.60512256622314,0.0,415.0846004486084],[-280.4471969604492,0.0,420.01757621765137],[-277.1690845489502,0.0,424.7307300567627],[-273.6867904663086,0.0,429.2417526245117],[-269.91634368896484,0.0,433.5683822631836],[-265.77374935150146,0.0,437.72826194763184],[-261.1750364303589,0.0,441.7391300201416],[-256.03621006011963,0.0,445.6186771392822],[-250.27332305908203,0.0,449.3845462799072],[-245.41544914245605,0.0,452.106237411499],[-240.70444107055664,0.0,454.2954921722412],[-236.09750270843506,0.0,456.01978302001953],[-231.55183792114258,0.0,457.34663009643555],[-227.02467441558838,0.0,458.343505859375],[-222.47319221496582,0.0,459.0779781341553],[-175.13067722320557,0.0,463.2652282714844],[-164.9484157562256,0.0,463.65060806274414],[-100.34922361373901,0.0,462.6283645629883],[-80.39629459381104,0.0,461.53059005737305],[-31.41186833381653,0.0,456.57639503479004],[-16.607412695884705,0.0,454.121732711792],[-5.855374038219452,0.0,451.7594337463379],[38.22438716888428,0.0,440.39058685302734],[45.04004418849945,0.0,438.28043937683105],[51.749563217163086,0.0,435.9373092651367],[58.425915241241455,0.0,433.28003883361816],[65.14206528663635,0.0,430.22751808166504],[71.97099328041077,0.0,426.6985893249512],[78.98566722869873,0.0,422.6121425628662],[86.25905513763428,0.0,417.88697242736816],[93.20286512374878,0.0,412.8621578216553],[99.41491484642029,0.0,407.80720710754395],[105.01291751861572,0.0,402.69694328308105],[110.11459827423096,0.0,397.5061893463135],[114.83767032623291,0.0,392.2097444534302],[169.12524700164795,0.0,322.0378637313843],[443.2016372680664,0.0,-59.318727254867554],[456.8673610687256,0.0,-75.64583420753479],[459.6299648284912,0.0,-79.24298048019409],[462.1453285217285,0.0,-82.83454775810242],[464.30325508117676,0.0,-86.37075424194336],[465.99364280700684,0.0,-89.80181813240051],[467.106294631958,0.0,-93.07795763015747],[467.5311088562012,0.0,-96.14939093589783],[467.4156188964844,0.0,-98.32756519317627],[467.02256202697754,0.0,-100.2941370010376],[466.3848400115967,0.0,-102.08450555801392],[465.5354976654053,0.0,-103.7340521812439],[464.50748443603516,0.0,-105.27815818786621],[463.33374977111816,0.0,-106.75221681594849],[457.8413963317871,0.0,-112.65567541122437],[456.4338207244873,0.0,-114.3102765083313],[406.2716007232666,0.0,-178.56552600860596],[399.8332977294922,0.0,-187.76004314422607],[387.7886772155762,0.0,-206.500244140625],[372.9723930358887,0.0,-231.88047409057617],[335.78455448150635,0.0,-302.91054248809814],[306.5147399902344,0.0,-352.79204845428467],[301.10113620758057,0.0,-363.3660554885864],[282.7465772628784,0.0,-403.42512130737305],[277.7501106262207,0.0,-412.43505477905273],[272.09739685058594,0.0,-420.8648204803467],[265.5418634414673,0.0,-428.6252975463867],[257.8369617462158,0.0,-435.6273651123047],[248.73614311218262,0.0,-441.78194999694824],[237.99281120300293,0.0,-446.9998836517334],[227.68654823303223,0.0,-450.38957595825195],[217.85991191864014,0.0,-452.1260738372803],[208.40818881988525,0.0,-452.42466926574707],[199.22666549682617,0.0,-451.5005111694336],[190.21062850952148,0.0,-449.56889152526855],[181.25537633895874,0.0,-446.8449592590332],[143.9478635787964,0.0,-432.3310375213623],[133.7257981300354,0.0,-428.8741111755371],[109.47818756103516,0.0,-422.17440605163574],[75.31523108482361,0.0,-410.0242614746094],[69.45880651473999,0.0,-408.2951545715332],[63.28458786010742,0.0,-406.75997734069824],[56.690818071365356,0.0,-405.45973777770996],[49.57574903964996,0.0,-404.43549156188965],[38.289910554885864,0.0,-403.2951831817627],[28.0946284532547,0.0,-402.74109840393066],[23.241975903511047,0.0,-402.70214080810547],[18.46519708633423,0.0,-402.83164978027344],[13.698703050613403,0.0,-403.1369209289551],[8.876906335353851,0.0,-403.6252498626709],[-1.1949528008699417,0.0,-405.18031120300293],[-12.275087833404541,0.0,-407.55534172058105],[-16.186299920082092,0.0,-408.6165428161621],[-19.77381706237793,0.0,-409.8311424255371],[-23.100556433200836,0.0,-411.1747741699219],[-26.229435205459595,0.0,-412.6230716705322],[-41.10793471336365,0.0,-420.58191299438477],[-44.37086880207062,0.0,-422.1466064453125],[-47.876352071762085,0.0,-423.6454486846924],[-65.93095064163208,0.0,-429.96678352355957],[-72.35784530639648,0.0,-431.9430351257324],[-75.57381987571716,0.0,-432.7852249145508],[-78.85862588882446,0.0,-433.5202217102051],[-82.26262331008911,0.0,-434.14058685302734],[-85.83617210388184,0.0,-434.63897705078125],[-89.62962627410889,0.0,-435.007905960083],[-93.6933696269989,0.0,-435.23998260498047],[-98.15630912780762,0.0,-435.33458709716797],[-102.33887434005737,0.0,-435.27021408081055],[-106.29429817199707,0.0,-435.05473136901855],[-110.07581949234009,0.0,-434.696102142334],[-113.73666524887085,0.0,-434.2022895812988],[-117.33007431030273,0.0,-433.58116149902344],[-124.52752590179443,0.0,-431.98862075805664],[-152.8664231300354,0.0,-424.33929443359375],[-155.0816297531128,0.0,-423.6401081085205],[-157.24796056747437,0.0,-422.84955978393555],[-159.3826174736023,0.0,-421.93446159362793],[-161.5027904510498,0.0,-420.86172103881836],[-163.62566947937012,0.0,-419.5981979370117],[-165.7684564590454,0.0,-418.1107997894287],[-167.94837713241577,0.0,-416.3663864135742],[-172.99045324325562,0.0,-411.69748306274414],[-177.31329202651978,0.0,-406.9794178009033],[-181.0303807258606,0.0,-402.1965980529785],[-184.25524234771729,0.0,-397.3334789276123],[-187.1013641357422,0.0,-392.37449169158936],[-189.68225717544556,0.0,-387.30406761169434],[-199.62356090545654,0.0,-365.596866607666],[-202.5808334350586,0.0,-359.7358703613281]
            ]

            // push first point to close curve
            points.push(points[0])

            //babylonjs point to vector, the minus is because its rotated wrong
            points = points.map(vec=> new BABYLON.Vector3(-vec[0],vec[1]-4.5,-vec[2]));
            debugger;
            //Draw the path
            //var track = BABYLON.MeshBuilder.CreateLines('track', {
            //    points: points
            //}, scene);
            //track.color = new BABYLON.Color3(0, 0, 0);

            //craete actual path
            var path3d = new BABYLON.Path3D(points);


            /*-----------------------meshimport------------------------------------------*/
            var data = "data:base64," +GM_getResourceText("city_scene");

            var meshes = await loadMesh(/*meshNames*/"", /*rootUrl*/"", /*sceneFilename*/data, scene, undefined, ".glb")

            players.forEach(player=>{
                player.mesh = meshes[10].createInstance(player.name);
                let namePlane = createTextPlane(player.name, scene);
                namePlane.parent = player.mesh;
                let pos =namePlane.position;
                namePlane.position = new BABYLON.Vector3(pos.x,pos.y+2,pos.z);
            });
            var road = meshes.find(element => element.name==="road");
            road.freezeWorldMatrix();
            var emision = (sin(Math.abs(sunPos.altitude)*Math.PI + Math.PI/2)+1)/2;
            //buildings
            meshes[2].material.emissiveColor = new BABYLON.Color3(emision, emision, emision);
            meshes[2].material.freeze();
            meshes[2].freezeWorldMatrix();


            players.forEach(function(player){
                let mesh = player.mesh;

                mesh.rotationQuaternion = null;
                mesh.setAbsolutePosition(BABYLON.Vector3.Zero())
                //mesh.parent = track;

                mesh.rotate(new BABYLON.Vector3(0, 0, 1), Math.PI, BABYLON.Space.WORLD);

                var forward = new BABYLON.Vector3(-200, 0, 0);
                mesh.position = path3d.getPointAt(0);


                /*----------------Animation Loop---------------------------
		var distances = path3d.getDistances();
		console.log(distances);
		var traveled = 0;
		var totalDistance = distances[distances.length-1];
		*/
            });

            //set the max render distance/ depth to 1000 meter since everything else is blocked by skybox anyway
            camera.maxZ = 1000;
            //let closest = path3d.getClosestPositionTo(player.position);

            //showPath3D(path3d, 5, scene);
            var forward = new BABYLON.Vector3(-200, 0, 0);


            /*----------------Animation Loop---------------------------*/
            var distances = path3d.getDistances();
            totalDistance = distances[distances.length-1];

            const sphere = BABYLON.Mesh.CreateSphere("sphere", 3, 4, scene);
            const sphere2 = BABYLON.Mesh.CreateSphere("sphere", 3, 4, scene);
            const sphere3 = BABYLON.Mesh.CreateSphere("sphere", 3, 4, scene);

            var currentPlayer = players.find(player=> {
                    return hasClass(player.fullNode, 'selected')
                });
            if(typeof(currentPlayer)=="object"){
                    camera.parent= currentPlayer.mesh;
             }

            scene.registerAfterRender(function() {

                let delta = scene.getEngine().getDeltaTime() / 1000;
                players.forEach(player=>{
                    let mesh = player.mesh;
                    let speed = player.updateObj.precent - player.precentage;
                    let precentage = player.precentage + speed*delta;
                    let traveled = precentage * totalDistance;
                    player.precentage = precentage;

                    let tempN = path3d.getPointAt(((traveled+speed*200)%totalDistance)/totalDistance);
                    let tempP = path3d.getPointAt(((traveled-speed*200)%totalDistance)/totalDistance);

                    let axis1 = (tempP).subtract(tempN);
                    let axis3 = BABYLON.Vector3.Cross(BABYLON.Vector3.Down(), axis1);
                    let axis2 = BABYLON.Vector3.Cross(axis3, axis1);
                    let tempPOff = new BABYLON.Vector3(tempP.x +player.offset,tempP.y,tempP.z);
                    let tempNOff = new BABYLON.Vector3(tempN.x +player.offset,tempN.y,tempN.z);
                    let mid = ((tempPOff).add(tempNOff)).scale(0.5);
                    //let mid = ((tempP).add(tempN)).scale(0.5);
                    mesh.position = mid.add(new BABYLON.Vector3(0,1,0));// reposition mesh so that its center is the mid point
                    mesh.rotation = new BABYLON.Vector3.RotationFromAxis(axis1, axis2, axis3);

                    //sphere.position = tempN;
                    //sphere2.position = tempP;
                    //sphere3.position = mid;
                });

            });

            return scene;
        }

        (async () => {
            const canvas = document.getElementById("renderCanvas"); // Get the canvas element

            const engine = new BABYLON.Engine(canvas, true); // Generate the BABYLON 3D engine

            const scene = await createScene(engine, canvas); //Call the createScene function

            // Register a render loop to repeatedly render the scene
            engine.runRenderLoop(function () {
                scene.render();
            });
            // Watch for browser/canvas resize events
            window.addEventListener("resize", function () {
                engine.resize();
            });
        })().catch(e => {
            throw e;
        });

    }

})();
