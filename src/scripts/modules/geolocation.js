
//Take an address and convert it into latitude and longitude coordinates.
//If coordinates are succesfully returned, set maps origin.
export function codeAddress(address, callback) {
    var callback2 = callback;

    var geocoder = new google.maps.Geocoder();

    geocoder.geocode({ 'address': address }, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {

            var long = results[0].geometry.location.A;
            var lat = results[0].geometry.location.k;

            if (long === undefined) {
                long = results[0].geometry.location.B;
            }

            callback2({
                status: 'success',
                latitude: lat,
                longitude: long
            });

            //setPosition(lat, long);
        }
        else {
            callback2({
                status: 'error',
                message: status
            });
        }
    });
}

//Use geolocation and call callback function with coordinates
export function getCurrentPosition(callback) {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var position2 = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
            return callback(position2);
        }, function(error){
            alert(error.message);
            return callback(new google.maps.LatLng(35.22, -80.84));
        });
    } else {
        alert('Bummer dude! Can\'t find you!');
    }
}

