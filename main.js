// ==UserScript==
// @name         RacingVisual
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.torn.com/loader.php?sid=racing*
// @run-at       document-idle
// @require      https://github.com/MiniAlfa/torn-racinvisuals/blob/master/common.js
// @resource     racingVisualStyle  YOUR_CSS_File.css
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

(function() {
    'use strict';
    var svg,lapLength;

    var racingVisualStyle =GM_getResourceText("racingVisualStyle");
    GM_addStyle(racingVisualStyle);

    $('#mainContainer').after('<div id="racer"> <div id="hud"> <span id="speed" class="hud"><span id="speed_value" class="value">0</span> mph</span> <span id="current_lap_time" class="hud">Time: <span id="current_lap_time_value" class="value">0.0</span></span> <span id="last_lap_time" class="hud">Last Lap: <span id="last_lap_time_value" class="value">0.0</span></span> <span id="fast_lap_time" class="hud">Fastest Lap: <span id="fast_lap_time_value" class="value">0.0</span></span> </div> <canvas id="visualcanvas"> Sorry, this example cannot be run because your browser does not support the &lt;canvas&gt; element </canvas> Loading... </div> <audio id="music"> <source src="music/racer.mp3"> </audio> <span id="mute"></span><audio id="sound"> <source src="sound/racer.mp3"> </audio>');


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
        if(!svg) {alert('map could not be created!');return;}
        //create the track
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
