// Tab switching for the Strategy page. Panels are plain HTML; this only shows one at a time.
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".strategy-tab"));
  var panels = {};
  tabs.forEach(function (tab) {
    panels[tab.dataset.tab] = document.getElementById("panel-" + tab.dataset.tab);
  });

  function show(name) {
    if (!panels[name]) name = "opening";
    tabs.forEach(function (tab) {
      tab.setAttribute("aria-selected", tab.dataset.tab === name ? "true" : "false");
    });
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = key !== name;
    });
    try {
      history.replaceState(null, "", "#" + name);
    } catch (e) {}
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      show(tab.dataset.tab);
      window.scrollTo(0, 0);
    });
  });

  show(window.location.hash.replace("#", "") || "opening");
})();
