function pr(thing){
	console.log(thing);
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

function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }

function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)); }
function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)); }

function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }

// general sun calculations

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

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

getSunPosition = function (date, lat, lng) {

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
 