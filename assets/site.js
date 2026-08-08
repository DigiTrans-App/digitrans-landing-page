(function () {
  "use strict";

  var campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var storageKey = "digitrust_campaign";
  var maxValueLength = 200;

  function clean(value, maxLength) {
    if (!value) return "";
    return String(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength || maxValueLength);
  }

  function readStored() {
    try {
      return JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeStored(data) {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      // Attribution is useful but never required for the site to function.
    }
  }

  function setupNavigation() {
    var toggle = document.querySelector("[data-nav-toggle]");
    if (!toggle) return;
    var menuId = toggle.getAttribute("aria-controls");
    var menu = menuId ? document.getElementById(menuId) : null;
    if (!menu) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
      menu.classList.toggle("open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 980px)").matches) setOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (!window.matchMedia("(max-width: 980px)").matches) setOpen(false);
    });
  }

  function setupCampaignAttribution() {
    var params = new URLSearchParams(window.location.search);
    var campaign = readStored();

    campaignKeys.forEach(function (key) {
      if (params.get(key)) campaign[key] = clean(params.get(key));
    });
    if (params.get("intent")) campaign.intent = clean(params.get("intent"));
    writeStored(campaign);

    document.querySelectorAll("[data-campaign-link]").forEach(function (link) {
      try {
        var url = new URL(link.getAttribute("href"), window.location.origin);
        if (url.origin !== window.location.origin) return;
        campaignKeys.forEach(function (key) {
          if (campaign[key] && !url.searchParams.get(key)) url.searchParams.set(key, campaign[key]);
        });
        if (campaign.intent && !url.searchParams.get("intent") && url.pathname.indexOf("get-started") !== -1) {
          url.searchParams.set("intent", campaign.intent);
        }
        link.setAttribute("href", url.pathname + url.search + url.hash);
      } catch (error) {
        // Leave the original link unchanged when URL parsing fails.
      }
    });

    campaignKeys.concat(["intent"]).forEach(function (key) {
      var field = document.getElementById(key);
      if (!field) return;
      var value = params.get(key) || campaign[key] || "";
      field.value = clean(value || field.value);
    });

    var referrer = document.getElementById("referrer");
    if (referrer) referrer.value = clean(document.referrer || "direct", 500);

    var landingPage = document.getElementById("landing_page");
    if (landingPage) landingPage.value = clean(window.location.href, 500);

    var sourcePath = document.getElementById("source_path");
    if (sourcePath) sourcePath.value = clean(window.location.pathname, 250);
  }

  function setupIntakeForm() {
    var form = document.getElementById("digitrust-intake");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      var trap = document.getElementById("website_check");
      if (trap && trap.value) {
        event.preventDefault();
        window.location.href = "/intake-thank-you/";
        return;
      }

      var submit = form.querySelector("button[type='submit']");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Submitting...";
      }
    });
  }

  function setCopyrightYear() {
    document.querySelectorAll("[data-current-year]").forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  setupNavigation();
  setupCampaignAttribution();
  setupIntakeForm();
  setCopyrightYear();
})();
