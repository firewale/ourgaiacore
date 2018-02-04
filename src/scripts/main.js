import '../styles/main.css';
import jquery from 'jquery';
import * as geolocation from './modules/geolocation.js';
import * as marker from './modules/marker.js';
import * as wikipedia from './modules/wikipedia.js';
import * as search from './modules/search.js';
import * as map from './modules/map.js';

function loadScript(url, callback)
{
    // adding the script tag to the head as suggested before
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;

    // then bind the event to the callback function 
    // there are several events for cross browser compatibility
    script.onreadystatechange = callback;
    script.onload = callback;

    // fire the loading
    head.appendChild(script);
}

function initMap() {
    //alert('initmap started');

    geolocation.getCurrentPosition(function(latLng){
        //alert('retrieve position lat: ' + latLng);
        map.initialize(latLng, marker, wikipedia, search);
    });
}

loadScript('https://maps.googleapis.com/maps/api/js?key=AIzaSyDQ9RFABK0OQryOh-11qhCCzJkCuJ-vnGk', initMap);

var $ = jquery;

if (jquery.when.all === undefined) {
    jquery.when.all = function (deferreds) {
        var deferred = new jquery.Deferred();
        $.when.apply(jquery, deferreds).then(
            function () {
                deferred.resolve(Array.prototype.slice.call(arguments));
            },
            function () {
                deferred.fail(Array.prototype.slice.call(arguments));
            });

        return deferred;
    };
}

window.jQuery = jquery;