// Binding maps for the tab init/destroy dispatch system (see services.utils.js
// and navigation.utils.js). Only covers HTML fragments swapped into #view via
// tabNavigate() - "dashboard" and "index" are full pages loaded via
// pageNavigate() (a real navigation, not a tab swap) and are intentionally
// not part of this system.
export const rendererInitBinding = {
    "record-scan" : "initRecordScan",
    "recordings-lib" : "initRecordingsLib",
    "tutorials" : "initTutorials",
    "settings" : "initSettings",
};

export const rendererDestroyBinding = {
    "record-scan" : "destroyRecordScan",
    "recordings-lib" : "destroyRecordingsLib",
    "tutorials" : "destroyTutorials",
    "settings" : "destroySettings",
}
