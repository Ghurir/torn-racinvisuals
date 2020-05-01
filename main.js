// ==UserScript==
// @name         RacingVisual
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.torn.com/loader.php?sid=racing*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    var svg,lapLength;

    var style =`
/****************************************/
/* common styles used for v1 through v4 */
/****************************************/

#visualcanvas {width:100%}
#stats        { border: 2px solid black; }
#controls     { width: 28em; float: left; padding: 1em; font-size: 0.7em; }
#controls th  { text-align: right; vertical-align: middle; }
#instructions { clear: left; float: left; width: 17em; padding: 1em; border: 1px solid black; box-shadow: 0 0 5px black; }
#racer        { position: relative; z-index: 0; width: 50%; height: auto; margin: auto; border: 2px solid black; }
#canvas       { position: absolute; z-index: 0; width: 640px; height: 480px; z-index: 0; background-color: #72D7EE; }
#mute         { background-position:   0px 0px; width: 32px; height: 32px; background: url(images/mute.png); display: inline-block; cursor: pointer; position: absolute; margin-left: 20em; }
#mute.on      { background-position: -32px 0px; }

/**************************************************/
/* rudimentary heads up display (only used in v4) */
/**************************************************/

#hud                   { position: absolute; z-index: 1; width: 100%; padding: 5px 0; font-family: Verdana, Geneva, sans-serif; font-size: 0.8em; background-color: rgba(255,0,0,0.4); color: black; border-bottom: 2px solid black; box-sizing: border-box; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; }
#hud .hud              { background-color: rgba(255,255,255,0.6); padding: 5px; border: 1px solid black; margin: 0 5px; transition-property: background-color; transition-duration: 2s; -webkit-transition-property: background-color; -webkit-transition-duration: 2s; }
#hud #speed            { float: right; }
#hud #current_lap_time { float: left;  }
#hud #last_lap_time    { float: left; display: none;  }
#hud #fast_lap_time    { display: block; width: 12em;  margin: 0 auto; text-align: center; transition-property: background-color; transition-duration: 2s; -webkit-transition-property: background-color; -webkit-transition-duration: 2s; }
#hud .value            { color: black; font-weight: bold; }
#hud .fastest          { background-color: rgba(255,215,0,0.5); }

`;

    var styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = style;
    document.head.appendChild(styleSheet);
    //=========================================================================
    // minimalist DOM helpers
    //=========================================================================

    $('#mainContainer').after('<div id="racer"> <div id="hud"> <span id="speed" class="hud"><span id="speed_value" class="value">0</span> mph</span> <span id="current_lap_time" class="hud">Time: <span id="current_lap_time_value" class="value">0.0</span></span> <span id="last_lap_time" class="hud">Last Lap: <span id="last_lap_time_value" class="value">0.0</span></span> <span id="fast_lap_time" class="hud">Fastest Lap: <span id="fast_lap_time_value" class="value">0.0</span></span> </div> <canvas id="visualcanvas"> Sorry, this example cannot be run because your browser does not support the &lt;canvas&gt; element </canvas> Loading... </div> <audio id="music"> <source src="music/racer.mp3"> </audio> <span id="mute"></span><audio id="sound"> <source src="sound/racer.mp3"> </audio>');


    var Dom = {

        get:  function(id)                     { return ((id instanceof HTMLElement) || (id === document)) ? id : document.getElementById(id); },
        set:  function(id, html)               { Dom.get(id).innerHTML = html;                        },
        on:   function(ele, type, fn, capture) { Dom.get(ele).addEventListener(type, fn, capture);    },
        un:   function(ele, type, fn, capture) { Dom.get(ele).removeEventListener(type, fn, capture); },
        show: function(ele, type)              { Dom.get(ele).style.display = (type || 'block');      },
        blur: function(ev)                     { ev.target.blur();                                    },

        addClassName:    function(ele, name)     { Dom.toggleClassName(ele, name, true);  },
        removeClassName: function(ele, name)     { Dom.toggleClassName(ele, name, false); },
        toggleClassName: function(ele, name, on) {
            ele = Dom.get(ele);
            var classes = ele.className.split(' ');
            var n = classes.indexOf(name);
            on = (typeof on == 'undefined') ? (n < 0) : on;
            if (on && (n < 0))
                classes.push(name);
            else if (!on && (n >= 0))
                classes.splice(n, 1);
            ele.className = classes.join(' ');
        },

        storage: window.localStorage || {}

    };

    //=========================================================================
    // general purpose helpers (mostly math)
    //=========================================================================

    var Util = {

        timestamp:        function()                  { return new Date().getTime();                                    },
        toInt:            function(obj, def)          { if (obj !== null) { var x = parseInt(obj, 10); if (!isNaN(x)) return x; } return Util.toInt(def, 0); },
        toFloat:          function(obj, def)          { if (obj !== null) { var x = parseFloat(obj);   if (!isNaN(x)) return x; } return Util.toFloat(def, 0.0); },
        limit:            function(value, min, max)   { return Math.max(min, Math.min(value, max));                     },
        randomInt:        function(min, max)          { return Math.round(Util.interpolate(min, max, Math.random()));   },
        randomChoice:     function(options)           { return options[Util.randomInt(0, options.length-1)];            },
        percentRemaining: function(n, total)          { return (n%total)/total;                                         },
        accelerate:       function(v, accel, dt)      { return v + (accel * dt);                                        },
        interpolate:      function(a,b,percent)       { return a + (b-a)*percent;                                       },
        easeIn:           function(a,b,percent)       { return a + (b-a)*Math.pow(percent,2);                           },
        easeOut:          function(a,b,percent)       { return a + (b-a)*(1-Math.pow(1-percent,2));                     },
        easeInOut:        function(a,b,percent)       { return a + (b-a)*((-Math.cos(percent*Math.PI)/2) + 0.5);        },
        exponentialFog:   function(distance, density) { return 1 / (Math.pow(Math.E, (distance * distance * density))); },
        lerp:             function (start, end, amt)  { return (1-amt)*start+amt*end;                                   },

        increase:  function(start, increment, max) { // with looping
            var result = start + increment;
            while (result >= max)
                result -= max;
            while (result < 0)
                result += max;
            return result;
        },

        project: function(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
            p.camera.x     = (p.world.x || 0) - cameraX;
            p.camera.y     = (p.world.y || 0) - cameraY;
            p.camera.z     = (p.world.z || 0) - cameraZ;
            p.screen.scale = cameraDepth/p.camera.z;
            p.screen.x     = Math.round((width/2)  + (p.screen.scale * p.camera.x  * width/2));
            p.screen.y     = Math.round((height/2) - (p.screen.scale * p.camera.y  * height/2));
            p.screen.w     = Math.round(             (p.screen.scale * roadWidth   * width/2));
        },

        overlap: function(x1, w1, x2, w2, percent) {
            var half = (percent || 1)/2;
            var min1 = x1 - (w1*half);
            var max1 = x1 + (w1*half);
            var min2 = x2 - (w2*half);
            var max2 = x2 + (w2*half);
            return ! ((max1 < min2) || (min1 > max2));
        }

    };

    //=========================================================================
    // POLYFILL for requestAnimationFrame
    //=========================================================================

    if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
        window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function(callback, element) {
            window.setTimeout(callback, 1000 / 60);
        };
    }

    //=========================================================================
    // GAME LOOP helpers
    //=========================================================================

    var Game = {  // a modified version of the game loop from my previous boulderdash game - see http://codeincomplete.com/posts/2011/10/25/javascript_boulderdash/#gameloop

        run: function(options) {

            Game.loadImages(options.images, function(images) {

                options.ready(images); // tell caller to initialize itself because images are loaded and we're ready to rumble


                var canvas = options.canvas,    // canvas render target is provided by caller
                    update = options.update,    // method to update game logic is provided by caller
                    render = options.render,    // method to render the game is provided by caller
                    step   = options.step,      // fixed frame step (1/fps) is specified by caller
                    now    = null,
                    last   = Util.timestamp(),
                    dt     = 0,
                    gdt    = 0;

                function frame() {
                    now = Util.timestamp();
                    dt  = Math.min(1, (now - last) / 1000); // using requestAnimationFrame have to be able to handle large delta's caused when it 'hibernates' in a background or non-visible tab
                    gdt = gdt + dt;
                    while (gdt > step) {
                        gdt = gdt - step;
                        update(step);
                    }
                    render();
                    last = now;
                    requestAnimationFrame(frame, canvas);
                }
                frame(); // lets get this party started
                Game.playMusic();
            });
        },

        //---------------------------------------------------------------------------

        loadImages: function(names, callback) { // load multiple images and callback when ALL images have loaded
            var result = [];
            var count  = names.length;

            var onload = function() {
                if (--count === 0)
                    callback(result);
            };

            for(var n = 0 ; n < names.length ; n++) {
                var name = names[n];
                result[n] = document.createElement('img');
                Dom.on(result[n], 'load', onload);
                //result[n].src = "images/" + name + ".png";
                if(name == 'background')
                    result[n].src = 'https://imgur.com/BJktljT.png';
                else if(name == 'sprites')
                    result[n].src = 'https://i.imgur.com/atfA5YK.png';
            }
        },

        //---------------------------------------------------------------------------


        playMusic: function() {
            var music = Dom.get('music');
            music.loop = true;
            music.volume = 0.05; // shhhh! annoying music!
            music.muted = (Dom.storage.muted === "true");
            music.play();
            Dom.toggleClassName('mute', 'on', music.muted);
            Dom.on('mute', 'click', function() {
                Dom.storage.muted = music.muted = !music.muted;
                Dom.toggleClassName('mute', 'on', music.muted);
            });
        }

    };

    //=========================================================================
    // canvas rendering helpers
    //=========================================================================

    var Render = {

        polygon: function(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.lineTo(x4, y4);
            ctx.closePath();
            ctx.fill();
        },

        //---------------------------------------------------------------------------

        segment: function(ctx, width, lanes, x1, y1, w1, x2, y2, w2, fog, color) {

            var r1 = Render.rumbleWidth(w1, lanes),
                r2 = Render.rumbleWidth(w2, lanes),
                l1 = Render.laneMarkerWidth(w1, lanes),
                l2 = Render.laneMarkerWidth(w2, lanes),
                lanew1, lanew2, lanex1, lanex2, lane;

            ctx.fillStyle = color.grass;
            ctx.fillRect(0, y2, width, y1 - y2);

            Render.polygon(ctx, x1-w1-r1, y1, x1-w1, y1, x2-w2, y2, x2-w2-r2, y2, color.rumble);
            Render.polygon(ctx, x1+w1+r1, y1, x1+w1, y1, x2+w2, y2, x2+w2+r2, y2, color.rumble);
            Render.polygon(ctx, x1-w1,    y1, x1+w1, y1, x2+w2, y2, x2-w2,    y2, color.road);

            if (color.lane) {
                lanew1 = w1*2/lanes;
                lanew2 = w2*2/lanes;
                lanex1 = x1 - w1 + lanew1;
                lanex2 = x2 - w2 + lanew2;
                for(lane = 1 ; lane < lanes ; lanex1 += lanew1, lanex2 += lanew2, lane++)
                    Render.polygon(ctx, lanex1 - l1/2, y1, lanex1 + l1/2, y1, lanex2 + l2/2, y2, lanex2 - l2/2, y2, color.lane);
            }

            Render.fog(ctx, 0, y1, width, y2-y1, fog);
        },

        //---------------------------------------------------------------------------

        background: function(ctx, background, width, height, layer, rotation, offset) {

            rotation = rotation || 0;
            offset   = offset   || 0;

            var imageW = layer.w/2;
            var imageH = layer.h;

            var sourceX = layer.x + Math.floor(layer.w * rotation);
            var sourceY = layer.y;
            var sourceW = Math.min(imageW, layer.x+layer.w-sourceX);
            var sourceH = imageH;

            var destX = 0;
            var destY = offset;
            var destW = Math.floor(width * (sourceW/imageW));
            var destH = height;

            try {ctx.drawImage(background, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH);}
            catch(e){}
            if (sourceW < imageW) ctx.drawImage(background, layer.x, sourceY, imageW-sourceW, sourceH, destW-1, destY, width-destW, destH);
        },

        //---------------------------------------------------------------------------

        sprite: function(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY, offsetX, offsetY, clipY) {

            //  scale for projection AND relative to roadWidth (for tweakUI)
            var destW  = (sprite.w * scale * width/2) * (SPRITES.SCALE * roadWidth);
            var destH  = (sprite.h * scale * width/2) * (SPRITES.SCALE * roadWidth);

            destX = destX + (destW * (offsetX || 0));
            destY = destY + (destH * (offsetY || 0));

            var clipH = clipY ? Math.max(0, destY+destH-clipY) : 0;
            if (clipH < destH)
                ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h - (sprite.h*clipH/destH), destX, destY, destW, destH - clipH);

        },

        //---------------------------------------------------------------------------

        player: function(ctx, width, height, resolution, roadWidth, sprites, speedPercent, scale, destX, destY, steer, updown) {

            var bounce = (1.5 * Math.random() * speedPercent * resolution) * Util.randomChoice([-1,1]);
            var sprite;
            if (steer < 0)
                sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_LEFT : SPRITES.PLAYER_LEFT;
            else if (steer > 0)
                sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_RIGHT : SPRITES.PLAYER_RIGHT;
            else
                sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_STRAIGHT : SPRITES.PLAYER_STRAIGHT;

            Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY + bounce, -0.5, -1);

            if (playerX<-0.7) Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.DRIFT_SMOKE_LEFT, scale, destX-65, destY + bounce -18, -0.5, -1);

            if (playerX>0.7) Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.DRIFT_SMOKE_RIGHT, scale, destX+65, destY + bounce -18, -0.5, -1);
        },

        //---------------------------------------------------------------------------

        fog: function(ctx, x, y, width, height, fog) {
            if (fog < 1) {
                ctx.globalAlpha = (1-fog);
                ctx.fillStyle = COLORS.FOG;
                ctx.fillRect(x, y, width, height);
                ctx.globalAlpha = 1;
            }
        },

        rumbleWidth:     function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(6,  2*lanes); },
        laneMarkerWidth: function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(32, 8*lanes); }

    };

    //=============================================================================
    // RACING GAME CONSTANTS
    //=============================================================================


    var COLORS = {
        SKY:  '#72D7EE',
        TREE: '#005108',
        FOG:  '#a1a1a1',
        LIGHT:  { road: '#636363', grass: '#10AA10', rumble: 'white', lane: '#CCCCCC'  },
        DARK:   { road: '#454545', grass: '#009A00', rumble: 'red'                   },
        START:  { road: 'white',   grass: '#10AA10',   rumble: 'white'                     },
        FINISH: { road: 'white',   grass: '#009A00',   rumble: 'red'                     }
    };

    var BACKGROUND = {
        "HILLS":{"x":0,"y":0,"w":1280,"h":480}
        ,"SKY":{"x":0,"y":480,"w":1280,"h":480}
        ,"TREES":{"x":0,"y":960,"w":1280,"h":480}
    };

    var SPRITES ={
        "BILLBOARD01": {
            "x": 5,
            "y": 5,
            "w": 300,
            "h": 170
        },
        "BILLBOARD02": {
            "x": 315,
            "y": 5,
            "w": 215,
            "h": 220
        },
        "BILLBOARD03": {
            "x": 540,
            "y": 5,
            "w": 230,
            "h": 220
        },
        "BILLBOARD04": {
            "x": 780,
            "y": 5,
            "w": 268,
            "h": 170
        },
        "BILLBOARD05": {
            "x": 1058,
            "y": 5,
            "w": 298,
            "h": 190
        },
        "BILLBOARD06": {
            "x": 5,
            "y": 205,
            "w": 298,
            "h": 190
        },
        "BILLBOARD07": {
            "x": 780,
            "y": 205,
            "w": 298,
            "h": 190
        },
        "BILLBOARD08": {
            "x": 5,
            "y": 405,
            "w": 385,
            "h": 265
        },
        "BILLBOARD09": {
            "x": 400,
            "y": 405,
            "w": 328,
            "h": 282
        },
        "BOULDER1": {
            "x": 1088,
            "y": 205,
            "w": 168,
            "h": 248
        },
        "BOULDER2": {
            "x": 738,
            "y": 405,
            "w": 298,
            "h": 140
        },
        "BOULDER3": {
            "x": 1046,
            "y": 463,
            "w": 320,
            "h": 220
        },
        "BUSH1": {
            "x": 5,
            "y": 693,
            "w": 240,
            "h": 155
        },
        "BUSH2": {
            "x": 738,
            "y": 693,
            "w": 232,
            "h": 152
        },
        "CACTUS": {
            "x": 980,
            "y": 693,
            "w": 235,
            "h": 118
        },
        "CAR01": {
            "x": 1266,
            "y": 205,
            "w": 80,
            "h": 56
        },
        "CAR02": {
            "x": 313,
            "y": 271,
            "w": 80,
            "h": 59
        },
        "CAR03": {
            "x": 403,
            "y": 271,
            "w": 88,
            "h": 55
        },
        "CAR04": {
            "x": 501,
            "y": 271,
            "w": 80,
            "h": 57
        },
        "COLUMN": {
            "x": 255,
            "y": 821,
            "w": 200,
            "h": 315
        },
        "DEAD_TREE1": {
            "x": 1225,
            "y": 693,
            "w": 135,
            "h": 332
        },
        "DEAD_TREE2": {
            "x": 5,
            "y": 1035,
            "w": 150,
            "h": 260
        },
        "DRIFT_SMOKE_LEFT": {
            "x": 591,
            "y": 271,
            "w": 113,
            "h": 69
        },
        "DRIFT_SMOKE_RIGHT": {
            "x": 1266,
            "y": 271,
            "w": 113,
            "h": 69
        },
        "IMAGEEDIT_3_2160032201": {
            "x": 465,
            "y": 855,
            "w": 510,
            "h": 510
        },
        "PALM_TREE": {
            "x": 985,
            "y": 821,
            "w": 215,
            "h": 540
        },
        "PLAYER_LEFT": {
            "x": 1366,
            "y": 5,
            "w": 192,
            "h": 108
        },
        "PLAYER_RIGHT": {
            "x": 1366,
            "y": 123,
            "w": 192,
            "h": 108
        },
        "PLAYER_STRAIGHT": {
            "x": 1389,
            "y": 241,
            "w": 192,
            "h": 108
        },
        "PLAYER_UPHILL_LEFT": {
            "x": 1376,
            "y": 359,
            "w": 192,
            "h": 108
        },
        "PLAYER_UPHILL_RIGHT": {
            "x": 1376,
            "y": 477,
            "w": 192,
            "h": 108
        },
        "PLAYER_UPHILL_STRAIGHT": {
            "x": 1376,
            "y": 595,
            "w": 192,
            "h": 108
        },
        "SEMI": {
            "x": 1370,
            "y": 713,
            "w": 122,
            "h": 144
        },
        "STUMP": {
            "x": 5,
            "y": 867,
            "w": 195,
            "h": 140
        },
        "TREE1": {
            "x": 1210,
            "y": 1035,
            "w": 360,
            "h": 360
        },
        "TREE2": {
            "x": 1591,
            "y": 5,
            "w": 282,
            "h": 295
        },
        "TRUCK": {
            "x": 1591,
            "y": 310,
            "w": 100,
            "h": 78
        }
    };

    SPRITES.SCALE = 0.3 * (1/SPRITES.PLAYER_STRAIGHT.w) ;// the reference sprite width should be 1/3rd the (half-)roadWidth

    SPRITES.BILLBOARDS = [SPRITES.BILLBOARD01, SPRITES.BILLBOARD02, SPRITES.BILLBOARD03, SPRITES.BILLBOARD04, SPRITES.BILLBOARD05, SPRITES.BILLBOARD06, SPRITES.BILLBOARD07, SPRITES.BILLBOARD08, SPRITES.BILLBOARD09];
    SPRITES.PLANTS     = [SPRITES.TREE1, SPRITES.TREE2, SPRITES.DEAD_TREE1, SPRITES.DEAD_TREE2, SPRITES.PALM_TREE, SPRITES.BUSH1, SPRITES.BUSH2, SPRITES.CACTUS, SPRITES.STUMP, SPRITES.BOULDER1, SPRITES.BOULDER2, SPRITES.BOULDER3];
    SPRITES.CARS       = [SPRITES.CAR01, SPRITES.CAR02, SPRITES.CAR03, SPRITES.CAR04, SPRITES.SEMI, SPRITES.TRUCK];







    var fps            = 60;                      // how many 'update' frames per second
    var step           = 1/fps;                   // how long is each frame (in seconds)
    var width          = 1024;                    // logical canvas width
    var height         = 768;                     // logical canvas height
    var centrifugal    = 5;                     // centrifugal force multiplier when going around curves
    var skySpeed       = 0.001;                   // background sky layer scroll speed when going around curve (or up hill)
    var hillSpeed      = 0.002;                   // background hill layer scroll speed when going around curve (or up hill)
    var treeSpeed      = 0.003;                   // background tree layer scroll speed when going around curve (or up hill)
    var skyOffset      = 0;                       // current sky scroll offset
    var hillOffset     = 0;                       // current hill scroll offset
    var treeOffset     = 0;                       // current tree scroll offset
    var segments       = [];                      // array of road segments
    var cars           = [];                      // array of cars on the road
    var canvas         = Dom.get('visualcanvas'); // our canvas...
    var ctx            = canvas.getContext('2d'); // ...and its drawing context
    var background     = null;                    // our background image (loaded below)
    var sprites        = null;                    // our spritesheet (loaded below)
    var resolution     = null;                    // scaling factor to provide resolution independence (computed)
    var roadWidth      = 2000;                    // actually half the roads width, easier math if the road spans from -roadWidth to +roadWidth
    var segmentLength  = 100;                     // length of a single segment
    var rumbleLength   = 50;                     // number of segments per red/white rumble strip
    var trackLength    = null;                    // z length of entire track (computed)
    var lanes          = 1;                       // number of lanesf
    var fieldOfView    = 100;                     // angle (degrees) for field of view
    var cameraHeight   = roadWidth/2;                    // z height of camera
    var cameraDepth    = null;                    // z distance camera is from screen (computed)
    var drawDistance   = 500;                     // number of segments to draw
    var playerX        = 0;                       // player x offset from center of road (-1 to 1 to stay independent of roadWidth)
    var playerZ        = null;                    // player relative z distance from camera (computed)
    var fogDensity     = 0;                       // exponential fog density
    var position       = 0;                       // current camera Z position (add playerZ to get player's absolute Z position)
    var speed          = 0;                       // current speed
    var maxSpeed       = 80000;      // top speed (ensure we can't move more than 1 segment in a single frame to make collision detection easier)
    var accel          =  maxSpeed/5;             // acceleration rate - tuned until it 'felt' right
    var totalCars      = 0;                     // total number of cars on the road
    var currentLapTime = 0;                       // current lap time
    var lastLapTime    = null;                    // last lap time

    var keyLeft        = false;
    var keyRight       = false;

    var hud = {
        speed:            { value: null, dom: Dom.get('speed_value')            },
        current_lap_time: { value: null, dom: Dom.get('current_lap_time_value') },
        last_lap_time:    { value: null, dom: Dom.get('last_lap_time_value')    },
        fast_lap_time:    { value: null, dom: Dom.get('fast_lap_time_value')    }
    };
    let tempDate = new Date().getTime();
    var smooth = {time:tempDate,direction:'straight'};

    var phi = 0;
    var prevPhi = phi;
    var lapPrecentage = 0;
    var prevLapPrecentage = lapPrecentage;
    var directionDeg = 0;
    var circle
    var distance = 0;

    //=========================================================================
    // UPDATE THE GAME WORLD
    //=========================================================================

    function update(dt) {

        var n, car, carW, sprite, spriteW;
        var playerSegment = findSegment(position+playerZ);
        var playerW       = SPRITES.PLAYER_STRAIGHT.w * SPRITES.SCALE;
        var speedPercent  = speed/maxSpeed;
        var dx            = dt * 2 * speedPercent; // at top speed, should be able to cross from left to right (-1 to 1) in 1 second
        var startPosition = position;

        updateCars(dt, playerSegment, playerW);

        position = Util.increase(position, speed *dt , trackLength);
        debugger;


        if (keyLeft)
            playerX = playerX - dx;
        else if (keyRight)
            playerX = playerX + dx;

        playerX = Util.lerp(playerX, playerX - ( speedPercent * playerSegment.curve * centrifugal), dx);



        if ((playerX < -1) || (playerX > 1)) {


            for(n = 0 ; n < playerSegment.sprites.length ; n++) {
                sprite  = playerSegment.sprites[n];
                spriteW = sprite.source.w * SPRITES.SCALE;
                if (Util.overlap(playerX, playerW, sprite.offset + spriteW/2 * (sprite.offset > 0 ? 1 : -1), spriteW)) {
                    position = Util.increase(playerSegment.p1.world.z, -playerZ, trackLength); // stop in front of sprite (at front of segment)
                    break;
                }
            }
        }

        for(n = 0 ; n < playerSegment.cars.length ; n++) {
            car  = playerSegment.cars[n];
            carW = car.sprite.w * SPRITES.SCALE;
            if (speed > car.speed) {
                if (Util.overlap(playerX, playerW, car.offset, carW, 0.8)) {
                    speed    = car.speed * (car.speed/speed);
                    position = Util.increase(car.z, -playerZ, trackLength);
                    break;
                }
            }
        }
        // auto steering || keep on track || road limit
        keyRight = keyLeft = false;
        let smoothTimeDif = new Date().getTime() - smooth.time;
        if(playerX>0.1) {
            smooth.time= new Date().getTime();
            smooth.direction="left";
        }
        else if(playerX<-0.1) {
            smooth.time = new Date().getTime();
            smooth.direction="right";
        }

        if(smoothTimeDif <= 300 && smooth.direction == "left") {keyLeft = true;}
        else if (smoothTimeDif <= 300 && smooth.direction == "right"){keyRight = true;}


        playerX = Util.limit(playerX, -1, 1);     // dont ever let it go too far out of bounds
        speed   = Util.limit(speed, 0, maxSpeed); // or exceed maxSpeed

        skyOffset  = Util.increase(skyOffset,  skySpeed  * playerSegment.curve * (position-startPosition)/segmentLength, 1);
        hillOffset = Util.increase(hillOffset, hillSpeed * playerSegment.curve * (position-startPosition)/segmentLength, 1);
        treeOffset = Util.increase(treeOffset, treeSpeed * playerSegment.curve * (position-startPosition)/segmentLength, 1);

        if (position > playerZ) {
            if (currentLapTime && (startPosition < playerZ)) {
                lastLapTime    = currentLapTime;
                currentLapTime = 0;
                if (lastLapTime <= Util.toFloat(Dom.storage.fast_lap_time)) {
                    Dom.storage.fast_lap_time = lastLapTime;
                    updateHud('fast_lap_time', formatTime(lastLapTime));
                    Dom.addClassName('fast_lap_time', 'fastest');
                    Dom.addClassName('last_lap_time', 'fastest');
                }
                else {
                    Dom.removeClassName('fast_lap_time', 'fastest');
                    Dom.removeClassName('last_lap_time', 'fastest');
                }
                updateHud('last_lap_time', formatTime(lastLapTime));
                Dom.show('last_lap_time');
            }
            else {
                currentLapTime += dt;
            }
        }

        updateHud('speed',             Math.round(speed/100) );
        updateHud('current_lap_time', formatTime(currentLapTime));
    }

    //-------------------------------------------------------------------------

    function updateCars(dt, playerSegment, playerW) {
        var n, car, oldSegment, newSegment;
        for(n = 0 ; n < cars.length ; n++) {
            car         = cars[n];
            oldSegment  = findSegment(car.z);
            car.offset  = car.offset + updateCarOffset(car, oldSegment, playerSegment, playerW);
            car.z       = Util.increase(car.z, dt * car.speed, trackLength);
            car.percent = Util.percentRemaining(car.z, segmentLength); // useful for interpolation during rendering phase
            newSegment  = findSegment(car.z);
            if (oldSegment != newSegment) {
                index = oldSegment.cars.indexOf(car);
                oldSegment.cars.splice(index, 1);
                newSegment.cars.push(car);
            }
        }
    }

    function updateCarOffset(car, carSegment, playerSegment, playerW) {

        var i, j, dir, segment, otherCar, otherCarW, lookahead = 20, carW = car.sprite.w * SPRITES.SCALE;

        // optimization, dont bother steering around other cars when 'out of sight' of the player
        if ((carSegment.index - playerSegment.index) > drawDistance)
            return 0;

        for(i = 1 ; i < lookahead ; i++) {
            segment = segments[(carSegment.index+i)%segments.length];

            if ((segment === playerSegment) && (car.speed > speed) && (Util.overlap(playerX, playerW, car.offset, carW, 1.2))) {
                if (playerX > 0.5)
                    dir = -1;
                else if (playerX < -0.5)
                    dir = 1;
                else
                    dir = (car.offset > playerX) ? 1 : -1;
                return dir * 1/i * (car.speed-speed)/maxSpeed; // the closer the cars (smaller i) and the greated the speed ratio, the larger the offset
            }

            for(j = 0 ; j < segment.cars.length ; j++) {
                otherCar  = segment.cars[j];
                otherCarW = otherCar.sprite.w * SPRITES.SCALE;
                if ((car.speed > otherCar.speed) && Util.overlap(car.offset, carW, otherCar.offset, otherCarW, 1.2)) {
                    if (otherCar.offset > 0.5)
                        dir = -1;
                    else if (otherCar.offset < -0.5)
                        dir = 1;
                    else
                        dir = (car.offset > otherCar.offset) ? 1 : -1;
                    return dir * 1/i * (car.speed-otherCar.speed)/maxSpeed;
                }
            }
        }

        // if no cars ahead, but I have somehow ended up off road, then steer back on
        if (car.offset < -0.1)
            return 0.1;
        else if (car.offset > 0.1)
            return -0.1;
        else
            return 0;
    }

    //-------------------------------------------------------------------------

    function updateHud(key, value) { // accessing DOM can be slow, so only do it if value has changed
        if (hud[key].value !== value) {
            hud[key].value = value;
            Dom.set(hud[key].dom, value);
        }
    }

    function formatTime(dt) {
        var minutes = Math.floor(dt/60);
        var seconds = Math.floor(dt - (minutes * 60));
        var tenths  = Math.floor(10 * (dt - Math.floor(dt)));
        if (minutes > 0)
            return minutes + "." + (seconds < 10 ? "0" : "") + seconds + "." + tenths;
        else
            return seconds + "." + tenths;
    }

    //=========================================================================
    // RENDER THE GAME WORLD
    //=========================================================================

    function render() {

        var baseSegment   = findSegment(position);
        var basePercent   = Util.percentRemaining(position, segmentLength);
        var playerSegment = findSegment(position+playerZ);
        var playerPercent = Util.percentRemaining(position+playerZ, segmentLength);
        var playerY       = Util.interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);
        var maxy          = height;

        var x  = 0;
        var dx = - (baseSegment.curve * basePercent);

        ctx.clearRect(0, 0, width, height);

        Render.background(ctx, background, width, height, BACKGROUND.SKY,   skyOffset,  resolution * skySpeed  * playerY);
        Render.background(ctx, background, width, height, BACKGROUND.HILLS, hillOffset, resolution * hillSpeed * playerY);
        Render.background(ctx, background, width, height, BACKGROUND.TREES, treeOffset, resolution * treeSpeed * playerY);

        var n, i, segment, car, sprite, spriteScale, spriteX, spriteY;

        for(n = 0 ; n < drawDistance ; n++) {

            segment        = segments[(baseSegment.index + n) % segments.length];
            segment.looped = segment.index < baseSegment.index;
            segment.fog    = Util.exponentialFog(n/drawDistance, fogDensity);
            segment.clip   = maxy;

            Util.project(segment.p1, (playerX * roadWidth) - x,      playerY + cameraHeight, position - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);
            Util.project(segment.p2, (playerX * roadWidth) - x - dx, playerY + cameraHeight, position - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);

            x  = x + dx;
            dx = dx + segment.curve;

            if ((segment.p1.camera.z <= cameraDepth)         || // behind us
                (segment.p2.screen.y >= segment.p1.screen.y) || // back face cull
                (segment.p2.screen.y >= maxy))                  // clip by (already rendered) hill
                continue;

            Render.segment(ctx, width, lanes,
                           segment.p1.screen.x,
                           segment.p1.screen.y,
                           segment.p1.screen.w,
                           segment.p2.screen.x,
                           segment.p2.screen.y,
                           segment.p2.screen.w,
                           segment.fog,
                           segment.color);

            maxy = segment.p1.screen.y;
        }

        for(n = (drawDistance-1) ; n > 0 ; n--) {
            segment = segments[(baseSegment.index + n) % segments.length];

            for(i = 0 ; i < segment.cars.length ; i++) {
                car         = segment.cars[i];
                sprite      = car.sprite;
                spriteScale = Util.interpolate(segment.p1.screen.scale, segment.p2.screen.scale, car.percent);
                spriteX     = Util.interpolate(segment.p1.screen.x,     segment.p2.screen.x,     car.percent) + (spriteScale * car.offset * roadWidth * width/2);
                spriteY     = Util.interpolate(segment.p1.screen.y,     segment.p2.screen.y,     car.percent);
                Render.sprite(ctx, width, height, resolution, roadWidth, sprites, car.sprite, spriteScale, spriteX, spriteY, -0.5, -1, segment.clip);
            }

            for(i = 0 ; i < segment.sprites.length ; i++) {
                sprite      = segment.sprites[i];
                spriteScale = segment.p1.screen.scale;
                spriteX     = segment.p1.screen.x + (spriteScale * sprite.offset * roadWidth * width/2);
                spriteY     = segment.p1.screen.y;
                Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite.source, spriteScale, spriteX, spriteY, (sprite.offset < 0 ? -1 : 0), -1, segment.clip);
            }

            if (segment == playerSegment) {
                Render.player(ctx, width, height, resolution, roadWidth, sprites, speed/maxSpeed,
                              cameraDepth/playerZ,
                              width/2,
                              (height/2) - (cameraDepth/playerZ * Util.interpolate(playerSegment.p1.camera.y, playerSegment.p2.camera.y, playerPercent) * height/2),
                              speed * (keyLeft ? -1 : keyRight ? 1 : 0),
                              playerSegment.p2.world.y - playerSegment.p1.world.y);
            }
        }
    }

    function findSegment(z) {
        return segments[Math.floor(z/segmentLength) % segments.length];
    }

    //=========================================================================
    // BUILD ROAD GEOMETRY
    //=========================================================================

    function lastY() { return (segments.length === 0) ? 0 : segments[segments.length-1].p2.world.y; }

    function addSegment(curve, y) {
        var n = segments.length;
        segments.push({
            index: n,
            p1: { world: { y: lastY(), z:  n   *segmentLength }, camera: {}, screen: {} },
            p2: { world: { y: y,       z: (n+1)*segmentLength }, camera: {}, screen: {} },
            curve: curve,
            sprites: [],
            cars: [],
            color: Math.floor(n/rumbleLength)%2 ? COLORS.DARK : COLORS.LIGHT
        });
    }

    function addSprite(n, sprite, offset) {
        segments[n].sprites.push({ source: sprite, offset: offset });
    }

    function addRoad(enter, hold, leave, curve, y) {
        var startY   = lastY();
        var endY     = startY + (Util.toInt(y, 0) * segmentLength);
        var n, total = enter + hold + leave;
        if(segments.length == 0 || segments[segments.length-1].curve == 0){
            for(n = 0 ; n < hold  ; n++)
                addSegment(curve, Util.easeInOut(startY, endY, (enter+n)/total));
        }else{
            for(n = 0 ; n < leave ; n++)
                addSegment(Util.easeInOut(curve, 0, n/leave), Util.easeInOut(startY, endY, (enter+hold+n)/total));
        }

        /*for(n = 0 ; n < leave ; n++)
            addSegment(Util.easeInOut(curve, 0, n/leave), Util.easeInOut(startY, endY, (enter+hold+n)/total));*/
    }

    var ROAD = {
        LENGTH: { NONE: 0, SHORT:  20, MEDIUM:   50, LONG:  100 },
        HILL:   { NONE: 0, LOW:    10, MEDIUM:   20, HIGH:   30 },
        CURVE:  { NONE: 0, EASY:    4, MEDIUM:    6, HARD:    8 }
    };

    function addStraight(num) {
        num = num || ROAD.LENGTH.MEDIUM;
        addRoad(num, num, num, 0, 0);
    }

    function addHill(num, height) {
        num    = num    || ROAD.LENGTH.MEDIUM;
        height = height || ROAD.HILL.MEDIUM;
        addRoad(num, num, num, 0, height);
    }

    function addCurve(num, curve, height) {
        num    = num    || ROAD.LENGTH.MEDIUM;
        curve  = curve  || ROAD.CURVE.MEDIUM;
        height = height || ROAD.HILL.NONE;
        addRoad(num, num, num, curve, height);
    }

    function addLowRollingHills(num, height) {
        num    = num    || ROAD.LENGTH.SHORT;
        height = height || ROAD.HILL.LOW;
        addRoad(num, num, num,  0,                height/2);
        addRoad(num, num, num,  0,               -height);
        addRoad(num, num, num,  ROAD.CURVE.EASY,  height);
        addRoad(num, num, num,  0,                0);
        addRoad(num, num, num, -ROAD.CURVE.EASY,  height/2);
        addRoad(num, num, num,  0,                0);
    }

    function addSCurves() {
        addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.EASY,    ROAD.HILL.NONE);
        addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,   ROAD.CURVE.MEDIUM,  ROAD.HILL.MEDIUM);
        addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,   ROAD.CURVE.EASY,   -ROAD.HILL.LOW);
        addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.EASY,    ROAD.HILL.MEDIUM);
        addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.MEDIUM, -ROAD.HILL.MEDIUM);
    }

    function addBumps() {
        addRoad(10, 10, 10, 0,  5);
        addRoad(10, 10, 10, 0, -2);
        addRoad(10, 10, 10, 0, -5);
        addRoad(10, 10, 10, 0,  8);
        addRoad(10, 10, 10, 0,  5);
        addRoad(10, 10, 10, 0, -7);
        addRoad(10, 10, 10, 0,  5);
        addRoad(10, 10, 10, 0, -2);
    }

    function addDownhillToEnd(num) {
        num = num || 200;
        addRoad(num, num, num, -ROAD.CURVE.EASY, -lastY()/segmentLength);
    }

    function resetRoad() {
        segments = [];
        let difY = svg.getPointAtLength(0.01 * lapLength).y-svg.getPointAtLength(0).y;
        let difX = svg.getPointAtLength(0.01 * lapLength).x-svg.getPointAtLength(0).x;
        prevPhi = Math.atan2(difY,difX);
        phi = 0;
        let maxDirectionDeg = 5;
        for(lapPrecentage=0.001;lapPrecentage<1;lapPrecentage+=0.001){
            let x = svg.getPointAtLength(lapPrecentage * lapLength).x;
            let y = svg.getPointAtLength(lapPrecentage * lapLength).y;
            let prevX = svg.getPointAtLength(prevLapPrecentage * lapLength).x;
            let prevY = svg.getPointAtLength(prevLapPrecentage * lapLength).y;
            prevLapPrecentage = lapPrecentage;
            let difY = y-prevY;
            let difX = x-prevX;
            phi = Math.atan2(difY,difX);
            let directionRad = phi - prevPhi;
            prevPhi = phi;
            directionDeg = (directionRad*180)/Math.PI;

            circle.setAttribute("cx",svg.getPointAtLength(lapPrecentage * lapLength).x);
            circle.setAttribute("cy",svg.getPointAtLength(lapPrecentage * lapLength).y );
            directionDeg = (directionDeg <= maxDirectionDeg)? directionDeg : maxDirectionDeg;


            if(directionDeg>0.5 || directionDeg<-0.5){
                addCurve(10,directionDeg/2,0);
            }
            else{addStraight(10);}


            /*
          addLowRollingHills();
		  addSCurves();
		  addCurve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.MEDIUM, ROAD.HILL.LOW);
		  addBumps();
		  addLowRollingHills();
		  addCurve(ROAD.LENGTH.LONG*2, ROAD.CURVE.MEDIUM, ROAD.HILL.MEDIUM);

		  addHill(ROAD.LENGTH.MEDIUM, ROAD.HILL.HIGH);
		  addSCurves();
		  addCurve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, ROAD.HILL.NONE);
		  addHill(ROAD.LENGTH.LONG, ROAD.HILL.HIGH);
		  addCurve(ROAD.LENGTH.LONG, ROAD.CURVE.MEDIUM, -ROAD.HILL.LOW);
		  addBumps();
		  addHill(ROAD.LENGTH.LONG, -ROAD.HILL.MEDIUM);
		  addStraight();
		  addSCurves();
          */
        }
        lapPrecentage = prevLapPrecentage = 0;

        trackLength = segments.length * segmentLength;
        circle.setAttribute("cx",svg.getPointAtLength(0).x);
        circle.setAttribute("cy",svg.getPointAtLength(0).y );
        resetSprites();
        resetCars();

        segments[findSegment(playerZ).index + 2].color = COLORS.START;
        segments[findSegment(playerZ).index + 3].color = COLORS.START;
        for(var n = 0 ; n < rumbleLength ; n++) segments[segments.length-1-n].color = COLORS.FINISH;
    }

    function resetSprites() {
        var n;

        addSprite(30,  SPRITES.IMAGEEDIT_3_2160032201, -0.5);
        addSprite(40,  SPRITES.BILLBOARD06, -1);
        addSprite(60,  SPRITES.BILLBOARD08, -1);
        addSprite(80,  SPRITES.BILLBOARD09, -1);
        addSprite(100, SPRITES.BILLBOARD01, -1);
        addSprite(120, SPRITES.BILLBOARD02, -1);
        addSprite(140, SPRITES.BILLBOARD03, -1);
        addSprite(160, SPRITES.BILLBOARD04, -1);
        addSprite(180, SPRITES.BILLBOARD05, -1);

        addSprite(240,                  SPRITES.BILLBOARD07, -1.2);
        addSprite(240,                  SPRITES.BILLBOARD06,  1.2);
        addSprite(segments.length - 25, SPRITES.BILLBOARD07, -1.2);
        addSprite(segments.length - 25, SPRITES.BILLBOARD06,  1.2);

        for(n = 10 ; n < 200 ; n += 4 + Math.floor(n/100)) {
            //addSprite(n, SPRITES.PALM_TREE, 0.5 + Math.random()*0.5);
            //addSprite(n, SPRITES.PALM_TREE,   1 + Math.random()*2);
        }

        for(n = 250 ; n < 1000 ; n += 5) {
            //addSprite(n,     SPRITES.COLUMN, 1.1);
            //addSprite(n + Util.randomInt(0,5), SPRITES.TREE1, -1 - (Math.random() * 2));
            //addSprite(n + Util.randomInt(0,5), SPRITES.TREE2, -1 - (Math.random() * 2));
        }

        for(n = 200 ; n < segments.length ; n += 3) {
            //addSprite(n, Util.randomChoice(SPRITES.PLANTS), Util.randomChoice([1,-1]) * (2 + Math.random() * 5));
        }

        var side, sprite, offset;
        for(n = 1000 ; n < (segments.length-50) ; n += 100) {
            //side      = Util.randomChoice([1, -1]);
            //addSprite(n + Util.randomInt(0, 50), Util.randomChoice(SPRITES.BILLBOARDS), -side);
            //for(i = 0 ; i < 20 ; i++) {
            //  sprite = Util.randomChoice(SPRITES.PLANTS);
            //  offset = side * (1.5 + Math.random());
            //  addSprite(n + Util.randomInt(0, 50), sprite, offset);
            //}

        }

    }

    function resetCars() {
        cars = [];
        var n, car, segment, offset, z, sprite, speed;
        for (let n = 0 ; n < totalCars ; n++) {
            offset = Math.random() * Util.randomChoice([-0.8, 0.8]);
            z      = Math.floor(Math.random() * segments.length) * segmentLength;
            sprite = Util.randomChoice(SPRITES.CARS);
            speed  = maxSpeed/4 + Math.random() * maxSpeed/(sprite == SPRITES.SEMI ? 4 : 2);
            car = { offset: offset, z: z, sprite: sprite, speed: speed };
            segment = findSegment(car.z);
            segment.cars.push(car);
            cars.push(car);
        }
    }

    //=========================================================================
    // THE GAME LOOP
    //=========================================================================

    /*Game.run({
        canvas: canvas, render: render, update: update, step: step,
        images: ["background", "sprites"],
        ready: function(images) {
            background = images[0];
            sprites    = images[1];
            reset();
            Dom.storage.fast_lap_time = Dom.storage.fast_lap_time || 180;
            updateHud('fast_lap_time', formatTime(Util.toFloat(Dom.storage.fast_lap_time)));
        }
    });*/

    function reset(options) {
        options       = options || {};
        canvas.width  = width  = Util.toInt(options.width,          width);
        canvas.height = height = Util.toInt(options.height,         height);
        roadWidth              = Util.toInt(options.roadWidth,      roadWidth);
        cameraHeight           = Util.toInt(options.cameraHeight,   cameraHeight);
        drawDistance           = Util.toInt(options.drawDistance,   drawDistance);
        fogDensity             = Util.toInt(options.fogDensity,     fogDensity);
        fieldOfView            = Util.toInt(options.fieldOfView,    fieldOfView);
        segmentLength          = Util.toInt(options.segmentLength,  segmentLength);
        rumbleLength           = Util.toInt(options.rumbleLength,   rumbleLength);
        cameraDepth            = 1 / Math.tan((fieldOfView/2) * Math.PI/180);
        playerZ                = (cameraHeight * cameraDepth);
        resolution             = height/480;

        if ((segments.length===0) || (options.segmentLength) || (options.rumbleLength))
            resetRoad(); // only rebuild road when necessary
    }






    var trackLengths = {Uptown:2.25,Withdrawl:3.4,Underdog:1.73,Parkland:1.43,Docks:3.81,Commerce:1.09,'Two Islands':2.71,Industrial:1.35,Vector:1.16,Mudpit:1.06,Hammerhead:1.16,Sewage:1.5,Meltdown:1.2,Speedway:0.9,'Stone Park':2.08,Convict:1.64};

    var svgCreated = false;
    $(document).ajaxComplete(function (event, xhr, ajax) {
        if (ajax.url.includes("sid=raceData") && !svgCreated) {
            let data = JSON.parse(xhr.responseText);
            let path = '<path stroke="blue"'+data.raceData.imagePath.split('<path')[1].split('</path>')+'</path>';
            let svg = '<div id="t"><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="520px" height="245px" viewBox="0 0 520 245" enable-background="new 0 0 520 245" xml:space="preserve">'+path+'</svg></div>';
            $('.drivers-list.right').append(svg);
            var realLapLength = trackLengths[data.raceData.title];
            start(realLapLength);
            Game.run({
                canvas: canvas, render: render, update: update, step: step,
                images: ["background", "sprites"],
                ready: function(images) {
                    background = images[0];
                    sprites    = images[1];
                    reset();
                    Dom.storage.fast_lap_time = Dom.storage.fast_lap_time || 180;
                    updateHud('fast_lap_time', formatTime(Util.toFloat(Dom.storage.fast_lap_time)));
                }
            });
            svgCreated = true;
        }
    });

    function start(realLapLength){
        var svgContainer = document.getElementById("t");
        var ns = "http://www.w3.org/2000/svg";
        svg = svgContainer.getElementsByTagNameNS(ns, "path")[0];
        var svgReal = svgContainer.getElementsByTagNameNS(ns, "svg")[0];

        var perME = document.getElementsByClassName('pd-completion')[0];
        var lapME = document.getElementsByClassName('pd-lap')[0];

        var lapsCount = lapME.innerText.split('/')[1]*1;
        lapLength = (svg.getTotalLength() *1);

        circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', 0);
        circle.setAttribute('cy', 0);
        circle.setAttributeNS(null, 'r', '3');
        svgReal.appendChild(circle);
        circle = svgContainer.getElementsByTagNameNS(ns, "circle")[0];

        var precentage = 0.5;
        var time = new Date().getTime();

        //on changes
        var target = document.querySelector('.pd-completion')
        var observer = new MutationObserver(refresh);
        var config = { attributes: true, childList: true, characterData: true };
        observer.observe(target, config);

        lapPrecentage = prevLapPrecentage = 0;
        function refresh() {
            lapPrecentage = (perME.innerText.includes('%'))?(perME.innerText.replace('%','')*1)/100*lapsCount : 0;
            debugger;
            lapPrecentage = lapPrecentage - parseInt(lapPrecentage);
            debugger;
            let dtD = (new Date().getTime() - time)/1000;
            debugger;
            direction(dtD);
            if((lapPrecentage - prevLapPrecentage)) time = new Date().getTime();
            debugger;
            circle.setAttribute("cx",svg.getPointAtLength(lapPrecentage * lapLength).x);
            circle.setAttribute("cy",svg.getPointAtLength(lapPrecentage * lapLength).y );
            prevLapPrecentage = lapPrecentage;

        }

        function direction(dtD){
            let x = svg.getPointAtLength(lapPrecentage * lapLength).x;
            let y = svg.getPointAtLength(lapPrecentage * lapLength).y;
            let prevX = svg.getPointAtLength(prevLapPrecentage * lapLength).x;
            let prevY = svg.getPointAtLength(prevLapPrecentage * lapLength).y;
            let difY = y-prevY;
            let difX = x-prevX;
            phi = Math.atan2(difY,difX);
            distance = Math.sqrt(difX*difX + difY*difY);

            //speed = (trackLength * lapPrecentage - position) / dtD;
            speed = (trackLength * lapPrecentage - position) ;
            if (speed<0) speed = 0;
        }
    }

})();
