var geoUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&callback=?';
var extractUrl = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&callback=?';
//var infoUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=info&inprop=url&callback=?';

//Get wikipedia data within a square of area 0.1 units from the inputted coordinates
export function getWikipediaData(latLng, callback) {
    var numOfResults = 100;
    var searchRadius = 10000;
    
    getArticles(latLng, numOfResults, searchRadius, callback);

    /*
    var expandedLat = lat + 0.1;

    //Test expanding the search by perform another search at an offset
    myModule.plotWikipediaData(expandedLat, long, numOfResults, searchRadius);

    expandedLat = lat - 0.1;
    myModule.plotWikipediaData(expandedLat, long, numOfResults, searchRadius);


    var expandedLong = long + 0.1;

    //Test expanding the search by perform another search at an offset
    myModule.plotWikipediaData(lat, expandedLong, numOfResults, searchRadius);

    expandedLong = lat - 0.1;
    myModule.plotWikipediaData(lat, expandedLong, numOfResults, searchRadius);
    */
}

function getArticles(latLng, numOfResults, searchRadius, callback) {
    var items = new Object();

    var lat = latLng.lat();
    var long = latLng.lng();

    var $ = window.jQuery;

    $.getJSON(geoUrl, {
        //gslimit: 100,
        gslimit: numOfResults,
        list: 'geosearch',
        //gsradius: 10000,
        gsradius: searchRadius,
        gscoord: lat + '|' + long
    })
        .done(function (data) {

            if (data.error != undefined) {
                alert('Error: ' + data.error.info);
                return;
            }

            var extractRequests = [];

            $.each(data.query.geosearch, function (i, item) {
                var itemData = {
                    title: item.title,
                    lat: item.lat,
                    long: item.lon,
                    pageId: item.pageid,


                    output: function () {
                        var str = 'Title: {0} Lat: {1} Long: {2} PageId: {3}'.format(this.title, this.lat, this.long, this.pageId);
                        return str;
                    }
                };
                items[item.pageid] = itemData;
            });

            $.each(items, function (i, itemDatum) {

                var extractRequest = $.getJSON(extractUrl, {
                    pageids: itemDatum.pageId
                });

                extractRequests.push(extractRequest);
            });

            $.when.all(extractRequests)
                .then(function (responses) {
                    $.each(responses, function (i, response) {
                        var pages; // = response[0].query.pages;

                        try {
                            if (Array.isArray(response)) {
                                pages = response[0].query.pages;
                            }
                            else if (response === 'success') {
                                return;
                            }
                            else {
                                pages = response.query.pages;
                            }
                        } catch (ex) {
                            return;
                        }

                        if (pages === undefined) return;

                        $.each(pages, function (key, value) {
                            items[key].extract = value.extract;
                        });
                    });

                    callback(items);
                });
        });
}

export function getWikipediaMarker() {
    //var path = baseImageUrl + image;
    var path = 'http://icons.iconarchive.com/icons/sykonist/popular-sites/16/Wikipedia-icon.png';
    return path;
}