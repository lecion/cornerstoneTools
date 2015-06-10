var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "stackPrefetch";
    var defaultMaxRequests = 11;
    var configuration = {};

    function renablePrefetch(e, data) {
        console.log('Current image changed, re-enabling prefetch');
        var element = data.element;
        var stackData = cornerstoneTools.getToolState(element, 'stack');
        if (stackData === undefined || stackData.data === undefined || stackData.data.length === 0) {
            return;
        }
        // Get the stackPrefetch tool data
        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if (stackPrefetchData === undefined) {
            // should not happen
            return;
        }
        var stackPrefetch = stackPrefetchData.data[0];
        stackPrefetch.enabled = true;

        prefetch(element);
    }

    function range(lowEnd, highEnd) {
        // Javascript version of Python's range function
        // http://stackoverflow.com/questions/3895478/does-javascript-have-a-method-like-range-to-generate-an-array-based-on-suppl
        var arr = [],
            c = highEnd - lowEnd + 1;

        while ( c-- ) {
            arr[c] = highEnd--;
        }
        return arr;
    }

    function prefetch(element) {
        // Check to make sure stack data exists
        var stackData = cornerstoneTools.getToolState(element, 'stack');
        if (stackData === undefined || stackData.data === undefined || stackData.data.length === 0) {
            return;
        }
        var stack = stackData.data[0];
        var currentImageIdIndex = stack.currentImageIdIndex;

        // Get the stackPrefetch tool data
        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if (stackPrefetchData === undefined) {
            // should not happen
            return;
        }
        var stackPrefetch = stackPrefetchData.data[0];

        // If all the requests are complete, disable the stackPrefetch tool
        if (stackPrefetch.indicesToRequest.length === 0) {
            stackPrefetch.enabled = false;
        }

        // Make sure the tool is still enabled
        if (stackPrefetch.enabled === false) {
            return;
        }

        // Get tool configuration
        var config = cornerstoneTools.stackPrefetch.getConfiguration();

        var stackLength = stack.imageIds.length;

        var maxImageIdIndex = currentImageIdIndex + config.maxSimultaneousRequests;
        if (maxImageIdIndex > stackLength) {
            maxImageIdIndex = stackLength - 1;
        }

        var imageIdIndices = range(currentImageIdIndex, maxImageIdIndex);

        // Remove an imageIdIndex from the list of indices to request
        // This fires when the individual image loading deferred is resolved        
        function removeFromList(imageIdIndex) {
            var index = stackPrefetch.indicesToRequest.indexOf(imageIdIndex);
            stackPrefetch.indicesToRequest.splice(index, 1);
        }
        
        // Throws an error if something has gone wrong
        function errorHandler(imageId) {
            throw "stackPrefetch: image not retrieved: " + imageId;
        }

        // Loop through the images that should be requested in this batch

        var deferredList = [];
        var lastCacheInfo;


        imageIdIndices.forEach(function(imageIdIndex) {
            var imageId = stack.imageIds[imageIdIndex];
            console.log("Fetching " + imageId);

            // Load and cache the image
            var loadImageDeferred = cornerstone.loadAndCacheImage(imageId);

            // When this is complete, remove the imageIdIndex from the list
            loadImageDeferred.done(function() {
                console.log("Done Fetching " + imageId);
                removeFromList(imageIdIndex);

                var cacheInfo = cornerstone.imageCache.getCacheInfo();
                console.log(cacheInfo);

                // Check if the cache is full
                if (lastCacheInfo && cacheInfo.sizeInBytes === lastCacheInfo.sizeInBytes) {
                    stackPrefetch.enabled = false;
                    console.log("Cache size isn't changing, stopping prefetching");
                }

                lastCacheInfo = cacheInfo;
            });

            loadImageDeferred.fail(function() {
                errorHandler(imageId);
            });

            // Add the image promises to a list
            deferredList.push(loadImageDeferred);
        });

        // When this batch of images is loaded (all async requests have finished)
        $.when.apply($, deferredList).done(function () {
            // If there are still images that need to be requested, and the 
            // cache is not full, call this function again
            if (stackPrefetch.indicesToRequest.length > 0 && stackPrefetch.enabled) {
                // Set a timeout here to prevent locking up the UI
                setTimeout(prefetch(element), 1);
            }
        });

        // If the entire batch of requests has failed, throw an error
        $.when.apply($, deferredList).fail(function () {
            throw "stackPrefetch: batch failed for element: " + element.id;
        });
    }

    function enable(element)
    {
        var config = cornerstoneTools.stackPrefetch.getConfiguration();

        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if (stackPrefetchData.data.length === 0) {
            // If this is the first time enabling the prefetching, add tool data

            // First check that there is stack data available
            var stackData = cornerstoneTools.getToolState(element, 'stack');
            if (stackData === undefined || stackData.data === undefined || stackData.data.length === 0) {
                return;
            }
            var stack = stackData.data[0];

            // The maximum simultaneous requests is capped at 
            // a rather arbitrary number of 11, since we don't want to overload any servers
            if (config === undefined || config.maxSimultaneousRequests === undefined) {
                config = {
                    "maxSimultaneousRequests" : Math.max(Math.ceil(stack.imageIds.length / 5), defaultMaxRequests)
                };
            }

            cornerstoneTools.stackPrefetch.setConfiguration(config);

            // Use the currentImageIdIndex from the stack as the initalImageIdIndex
            stackPrefetchData = {
                indicesToRequest : range(0, stack.imageIds.length - 1),
                enabled: true
            };
            cornerstoneTools.addToolState(element, toolType, stackPrefetchData);
        } else {
            // Otherwise, re-enable the prefetching
            stackPrefetchData.data[0].enabled = true;
            if (config && config.maxSimultaneousRequests) {
                config = {
                    "maxSimultaneousRequests" : maxSimultaneousRequests
                };
                cornerstoneTools.stackPrefetch.setConfiguration(config);
            }
        }

        prefetch(element);

        $(element).on("CornerstoneNewImage", renablePrefetch);
    }

    function disable(element)
    {
        $(element).off("CornerstoneNewImage", renablePrefetch);

        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        // If there is actually something to disable, disable it
        if (stackPrefetchData) {
            stackPrefetchData.data[0].enabled = false;
        }
    }

    function getConfiguration () {
        return configuration;
    }

    function setConfiguration(config) {
        configuration = config;
    }

    // module/private exports
    cornerstoneTools.stackPrefetch = {
        enable: enable,
        disable: disable,
        getConfiguration: getConfiguration,
        setConfiguration: setConfiguration
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
