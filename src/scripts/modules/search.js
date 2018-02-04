var geolocationLocal;

export function BuildSearchControl(controlDiv, geolocation, setLocationCallback) {

    geolocationLocal = geolocation;

    // Set CSS styles for the DIV containing the control
    // Setting padding to 5 px will offset the control
    // from the edge of the map
    controlDiv.style.padding = '5px';

    // Set CSS for the control border
    var controlUI = document.createElement('div');
    controlUI.className = 'controlOverlay';

    controlDiv.appendChild(controlUI);

    var controlstrip = document.getElementById('controlstrip');
    controlstrip.style.visibility = 'visible';
    controlUI.appendChild(controlstrip);

    var floater = controlstrip.children['floater'];

    var searchBox = floater.children['searchTerm'];
    var searchButton = floater.children['searchButton'];
    //var tagButton = floater.children['tagMeButton'];
    //var locateButton = floater.children['tagMeButton'];

    google.maps.event.addDomListener(searchButton, 'click', function () {
        search(setLocationCallback);
    });

    google.maps.event.addDomListener(searchBox, 'keypress', function (e) {
        if (e.key != 'Enter')
            return;

        search(setLocationCallback);
    });

    /*
    google.maps.event.addDomListener(tagButton, 'click', function () {
        tagMe();
    });

    google.maps.event.addDomListener(locateButton, 'click', function () {
        locate();
    });*/
}

function search(setLocationCallback) {
    var $ = window.jQuery;
    
    var searchTerm = $('#searchTerm').val();

    if (searchTerm === undefined || searchTerm === '') {
        alert('No search term entered!');
    }
    else {
        geolocationLocal.codeAddress(searchTerm, function (result) {
            if (result.status == 'success') {
                var latLng = new google.maps.latLng(result.latitude, result.longitude);
                setLocationCallback(latLng);
            }
            else if (result.status == 'error') {
                alert('Couldn\'t resolve ' + searchTerm + '. Reason: ' + result.message);
            }
        });
    }
}