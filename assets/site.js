(function () {
  "use strict";

  var campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var storageKey = "digitrust_campaign";
  var maxValueLength = 200;

  var isHomepage = window.location.pathname === "/" || window.location.pathname === "/index.html";

  function updateHomepageForAwsValidated() {
    if (!isHomepage) return;

    var announcement = document.querySelector(".announcement-inner");
    if (announcement) {
      var announcementLabel = document.createElement("strong");
      announcementLabel.textContent = "AWS Partner milestone:";

      var announcementMessage = document.createElement("span");
      announcementMessage.textContent = "DigiTrans has achieved the Validated stage of the AWS Partner Network Software Path, and DigiTrust passed the AWS Foundational Technical Review.";

      var announcementLink = document.createElement("a");
      announcementLink.href = "/news/aws-validated-software-path/";
      announcementLink.textContent = "Review the milestone";
      announcementLink.setAttribute("data-campaign-link", "");

      announcement.replaceChildren(announcementLabel, announcementMessage, announcementLink);
    }

    var eyebrow = document.querySelector(".hero .eyebrow");
    if (eyebrow) {
      eyebrow.innerHTML = '<span class="eyebrow-dot" aria-hidden="true"></span>Design-partner stage &middot; AWS Software Path &mdash; Validated &middot; limited pilot onboarding';
    }

    var microcopy = document.querySelector(".hero .microcopy");
    if (microcopy) {
      microcopy.textContent = "DigiTrust passed the AWS Foundational Technical Review. AWS Marketplace publication remains pending. The public ChatGPT app remains synthetic and read-only.";
    }

    var trustChips = document.querySelectorAll(".hero .truststrip .chip");
    if (trustChips.length) {
      trustChips[trustChips.length - 1].textContent = "AWS Software Path — Validated";
    }

    var awsSection = document.getElementById("aws");
    if (awsSection) {
      var awsKicker = awsSection.querySelector(".kicker");
      if (awsKicker) awsKicker.textContent = "AWS partner validation and co-sell readiness";

      var awsTitle = awsSection.querySelector("h2");
      if (awsTitle) awsTitle.textContent = "Validated in the AWS Partner Network Software Path";

      var awsCopy = awsSection.querySelectorAll(".aws-grid > div:first-child > p");
      if (awsCopy[0]) {
        awsCopy[0].textContent = "DigiTrans has achieved the Validated stage of the AWS Partner Network Software Path, and DigiTrust has successfully passed the AWS Foundational Technical Review. These milestones support our readiness to engage AWS customers, account teams, and partners through Marketplace and co-selling motions.";
      }
      if (awsCopy[1]) {
        awsCopy[1].textContent = "DigiTrust remains a provider-neutral evidence and assurance layer. AWS participation supports our distribution and co-selling strategy; it does not represent AWS endorsement, certification of every product claim, or dependence on AWS-specific models or infrastructure. Marketplace publication status is stated only when confirmed.";
      }

      var awsPilotLink = awsSection.querySelector("a.btn.primary");
      if (awsPilotLink) {
        awsPilotLink.textContent = "Discuss an AWS co-sell pilot";
        awsPilotLink.href = "/get-started.html?intent=aws-cosell-pilot";
      }
    }

    var ecosystemCards = document.querySelectorAll("#ecosystem .ecosystem-card");
    ecosystemCards.forEach(function (card) {
      var heading = card.querySelector("h3");
      var paragraph = card.querySelector("p");
      if (heading && paragraph && heading.textContent.trim() === "AWS") {
        paragraph.textContent = "AWS Partner Network Software Path — Validated. DigiTrust Foundational Technical Review approved. Marketplace and co-sell motions are underway.";
      }
    });
  }

  updateHomepageForAwsValidated();

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
      // Campaign attribution is helpful but never required for the site to function.
    }
  }

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
      // Leave the original link untouched if URL parsing fails.
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

  var form = document.getElementById("digitrust-intake");
  if (form) {
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
})();