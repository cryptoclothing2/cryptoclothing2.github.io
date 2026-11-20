/* DALI Pay launch helpers. Progressive enhancement only.
   No network requests, no storage, no tracking. */
(function () {
  "use strict";

  /* Close a :target lightbox with Escape, without a visible play control. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (location.hash && document.querySelector(location.hash + ".lightbox")) {
      location.hash = "invoice-designs";
    }
  });

  var panel = document.getElementById("journey-panel");
  var review = document.getElementById("journey-review");
  var auth = document.getElementById("journey-auth");
  var confirm = document.getElementById("journey-confirm");
  if (!panel || !review || !auth || !confirm) return;

  /* With JavaScript, walk through the preview in two taps.
     Without it, the confirmation stays visible and the public demo link works. */
  panel.classList.add("is-interactive");
  confirm.hidden = true;
  auth.hidden = true;
  panel.setAttribute("data-step", "0");

  review.addEventListener("click", function () {
    panel.setAttribute("data-step", "1");
    auth.hidden = false;
    review.hidden = true;
    auth.focus();
  });

  auth.addEventListener("click", function () {
    panel.setAttribute("data-step", "2");
    confirm.hidden = false;
    auth.hidden = true;
    confirm.focus();
  });
})();
