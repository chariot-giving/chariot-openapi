/*
 * Connect setup request builders.
 *
 * Powers the pickers on the two "configure your Connect" guide pages: the
 * reader selects their options, and we assemble a YAML block they can copy or
 * send straight to the team that configures Connects for their audience.
 *
 *   #chariot-setup-builder           nonprofits  -> implementations@
 *   #chariot-platform-setup-builder  platforms   -> integrations@
 *
 * Each builder declares its own root id, destination address and YAML shape in
 * BUILDERS below; everything else here is shared.
 *
 * The docs are a client-routed SPA, so this uses event delegation on `document`
 * plus a MutationObserver rather than per-element listeners, so it keeps
 * working when Fern re-renders or the reader navigates back to the page.
 *
 * Progressive enhancement: each page ships a valid default block inside its
 * output element, so if this script never runs the reader still has a usable
 * template to copy by hand.
 */
(function () {
  "use strict";

  function val(scope, key) {
    var el = scope.querySelector('[data-key="' + key + '"]');
    if (!el) return "";
    return (el.value || "").trim();
  }

  function checkedList(scope, group) {
    var boxes = scope.querySelectorAll('[data-group="' + group + '"]:checked');
    return Array.prototype.map.call(boxes, function (b) {
      return b.value;
    });
  }

  // Emit a YAML value, quoting only when the content would otherwise be
  // ambiguous. Keeps the common cases (plain words, URLs, dates) unquoted.
  // In a YAML plain scalar the sequences that actually bite are ": " and " #",
  // so those force quoting; a bare ':' or '#' inside a URL is fine.
  function scalar(v, placeholder) {
    if (!v) return placeholder || "";
    var plainSafe = /^[\w][\w .,'\/@:+&=?%~#()[\]-]*$/.test(v);
    var ambiguous = /: /.test(v) || / #/.test(v);
    if (plainSafe && !ambiguous) return v;
    return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function list(items, empty) {
    return "[" + (items.length ? items.join(", ") : empty) + "]";
  }

  // --- nonprofit builder -----------------------------------------------

  function buildNonprofit(scope) {
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");
    var closeOnConfirm = val(scope, "close_window");

    var lines = [];
    lines.push("organization: " + scalar(val(scope, "organization"), "<your nonprofit's name>"));
    lines.push("environment: " + scalar(val(scope, "environment")));
    lines.push("");
    lines.push("connect:");
    lines.push("  donor_details_step: " + scalar(val(scope, "donor_step")));
    lines.push("  details_to_show: " + list(show, "<none selected>"));
    lines.push("  details_to_require: " + list(require, "<none>"));
    lines.push("  monthly_recurring_gifts: " + scalar(val(scope, "recurring")));
    lines.push("  unconnected_daf_providers: " + scalar(val(scope, "unconnected")));
    lines.push("  close_window_on_confirm: " + scalar(closeOnConfirm));
    if (closeOnConfirm === "yes") {
      lines.push("  # confirmed: our page shows tracking ID, EIN, org name, provider link");
    }

    return lines.join("\n") + "\n";
  }

  function warnNonprofit(scope) {
    var notes = [];
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");

    // Requiring something the modal never shows can't be satisfied by the donor.
    var orphan = require.filter(function (r) {
      return show.indexOf(r) === -1;
    });
    if (orphan.length) {
      notes.push(
        "You are requiring " +
          orphan.join(", ") +
          " but not showing " +
          (orphan.length > 1 ? "them" : "it") +
          ". A donor cannot fill in a field that is hidden."
      );
    }

    if (val(scope, "donor_step") === "Skip" && show.length) {
      notes.push(
        "You chose to skip the donor details step, so the fields above will not be shown. Everything has to come from your form instead."
      );
    }

    if (val(scope, "close_window") === "yes") {
      notes.push(
        "Closing the window on confirm means your own confirmation page must show the tracking ID, your EIN, your organization name, and a link to the donor's DAF provider."
      );
    }

    return notes;
  }

  // --- platform builder ------------------------------------------------

  function buildPlatform(scope) {
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");
    var placements = checkedList(scope, "placement");
    var closeOnConfirm = val(scope, "close_window");

    var lines = [];
    lines.push("platform: " + scalar(val(scope, "platform"), "<your platform's name>"));
    lines.push("environment: " + scalar(val(scope, "environment")));
    lines.push("");
    lines.push("connect:");
    lines.push("  donor_details_step: " + scalar(val(scope, "donor_step")));
    lines.push("  details_to_show: " + list(show, "<none selected>"));
    lines.push("  details_to_require: " + list(require, "<none>"));
    lines.push("  monthly_recurring_grants: " + scalar(val(scope, "recurring")));
    lines.push("  unclaimed_nonprofits: " + scalar(val(scope, "unclaimed")));
    lines.push("  unconnected_daf_providers: " + scalar(val(scope, "unconnected")));
    lines.push("  close_window_on_confirm: " + scalar(closeOnConfirm));
    if (closeOnConfirm === "yes") {
      lines.push("  # confirmed: our page shows tracking ID, EIN, org name, provider link");
    }
    lines.push("");
    lines.push("fees:");
    lines.push("  platform_fee: " + scalar(val(scope, "platform_fee")));
    lines.push("  donor_may_cover: " + scalar(val(scope, "donor_covers")));
    lines.push("");
    lines.push("placement:");
    lines.push("  form_types: " + list(placements, "<none selected>"));
    lines.push("  button_position: " + scalar(val(scope, "position")));
    lines.push("");
    lines.push("crm:");
    lines.push("  sync_dafpay_gifts: " + scalar(val(scope, "crm_sync")));
    lines.push("  credit: " + scalar(val(scope, "credit")));

    return lines.join("\n") + "\n";
  }

  function warnPlatform(scope) {
    var notes = warnNonprofit(scope);

    if (val(scope, "platform_fee") === "Yes" ) {
      notes.push(
        "A platform fee has to be the one in your Chariot agreement. Chariot's fee and yours are capped together — see Create Grant in the API reference for the limit."
      );
    }

    if (val(scope, "donor_covers") === "Yes") {
      notes.push(
        "A donor-covered fee increases the grant amount. It is not a tip, and a for-profit platform tip is not allowed on a DAF grant."
      );
    }

    if (!checkedList(scope, "placement").length) {
      notes.push("Pick at least one form type, or Chariot cannot tell where DAFpay should appear on your platform.");
    }

    return notes;
  }

  // --- registry --------------------------------------------------------

  var BUILDERS = [
    {
      id: "chariot-setup-builder",
      email: "implementations@givechariot.com",
      subject: "DAFpay setup request",
      build: buildNonprofit,
      warnings: warnNonprofit,
    },
    {
      id: "chariot-platform-setup-builder",
      email: "integrations@givechariot.com",
      subject: "DAFpay platform setup request",
      build: buildPlatform,
      warnings: warnPlatform,
    },
  ];

  function builderFor(node) {
    for (var i = 0; i < BUILDERS.length; i++) {
      var scope = document.getElementById(BUILDERS[i].id);
      if (scope && node && scope.contains(node)) return BUILDERS[i];
    }
    return null;
  }

  function renderOne(spec) {
    var scope = document.getElementById(spec.id);
    if (!scope) return;

    var out = scope.querySelector("[data-output]");
    if (out) out.textContent = spec.build(scope);

    var notesEl = scope.querySelector("[data-warnings]");
    if (notesEl) {
      var notes = spec.warnings(scope);
      notesEl.innerHTML = "";
      notesEl.hidden = notes.length === 0;
      notes.forEach(function (n) {
        var li = document.createElement("li");
        li.textContent = n;
        notesEl.appendChild(li);
      });
    }

    var mail = scope.querySelector("[data-mailto]");
    if (mail) {
      mail.setAttribute(
        "href",
        "mailto:" +
          spec.email +
          "?subject=" +
          encodeURIComponent(spec.subject) +
          "&body=" +
          encodeURIComponent(spec.build(scope))
      );
    }
  }

  function render() {
    BUILDERS.forEach(renderOne);
  }

  function flash(btn, message) {
    var original = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", original);
    btn.textContent = message;
    setTimeout(function () {
      btn.textContent = btn.getAttribute("data-label") || original;
    }, 1500);
  }

  function copy(scope, btn) {
    var out = scope.querySelector("[data-output]");
    if (!out) return;
    var text = out.textContent || "";

    function done() {
      flash(btn, "Copied");
    }
    function fail() {
      flash(btn, "Press Ctrl+C");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
      return;
    }

    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (err) {
      fail();
    }
  }

  document.addEventListener("input", function (e) {
    var spec = builderFor(e.target);
    if (spec) renderOne(spec);
  });

  document.addEventListener("change", function (e) {
    var spec = builderFor(e.target);
    if (spec) renderOne(spec);
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-copy]");
    if (!btn) return;
    var spec = builderFor(btn);
    if (!spec) return;
    var scope = document.getElementById(spec.id);
    if (!scope) return;
    e.preventDefault();
    copy(scope, btn);
  });

  // Render as soon as a builder exists, and again whenever the SPA swaps one in.
  if (document.readyState !== "loading") render();
  document.addEventListener("DOMContentLoaded", render);

  if (typeof MutationObserver === "function") {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        render();
      }, 100);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
