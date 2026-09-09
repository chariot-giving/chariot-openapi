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

  // Emit "key: value" only when the reader actually filled the field, so the
  // request we receive has no empty keys to read past.
  function optional(key, v, indent) {
    if (!v) return null;
    return (indent || "") + key + ": " + scalar(v);
  }

  // An EIN identifies the legal organization; a name does not. Accept what
  // people actually paste (with or without the hyphen) and normalise it.
  function normalizeEin(v) {
    var digits = (v || "").replace(/[^0-9]/g, "");
    if (digits.length !== 9) return "";
    return digits.slice(0, 2) + "-" + digits.slice(2);
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
  }

  // Anything still in <angle brackets> is a placeholder the reader never
  // replaced. Sending one produces a request we cannot act on.
  function hasPlaceholder(text) {
    return /<[^>\n]+>/.test(text || "");
  }

  // --- nonprofit builder -----------------------------------------------

  function buildNonprofit(scope) {
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");
    var closeOnConfirm = val(scope, "close_window");

    var ein = normalizeEin(val(scope, "ein"));

    var lines = [];
    lines.push("organization: " + scalar(val(scope, "organization"), "<your nonprofit's name>"));
    lines.push("ein: " + scalar(ein, "<your nonprofit's EIN>"));
    lines.push("nonprofit_contact_email: " + scalar(val(scope, "contact_email"), "<contact at your nonprofit>"));
    lines.push("configuration_applies_to: " + scalar(val(scope, "applies_to")));
    lines.push("request_type: " + scalar(val(scope, "connect_type")));
    [optional("existing_connect_id", val(scope, "existing_connect_id")),
     optional("donation_form_url", val(scope, "form_url")),
     optional("target_go_live", val(scope, "go_live"))
    ].forEach(function (l) { if (l) lines.push(l); });
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
    var designations = optional("custom_designations", val(scope, "designations"), "  ");
    if (designations) lines.push(designations);

    return lines.join("\n") + "\n";
  }

  // Blockers are the answers we cannot act on or cannot interpret: a missing
  // identity, or a combination no donor could ever satisfy. These disable the
  // copy and email actions. Warnings below stay advisory.
  function blockNonprofit(scope) {
    var stop = [];
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");

    if (!val(scope, "organization")) stop.push("Add your nonprofit's name.");
    if (!normalizeEin(val(scope, "ein"))) {
      stop.push("Add your nonprofit's EIN, nine digits like 53-0196605. We look your organization up by EIN, because names are not unique.");
    }
    if (!isEmail(val(scope, "contact_email"))) {
      stop.push("Add a contact email at the nonprofit. Chariot needs one to create the Connect, and it cannot be a shared platform or agency address.");
    }
    if (val(scope, "connect_type") === "Reconfigure an existing Connect" && !val(scope, "existing_connect_id")) {
      stop.push("Add the Connect ID you want changed, or switch this to a new Connect request.");
    }

    // Requiring something the modal never shows can't be satisfied by the donor.
    var orphan = require.filter(function (r) {
      return show.indexOf(r) === -1;
    });
    if (orphan.length) {
      stop.push(
        "You are requiring " +
          orphan.join(", ") +
          " but not showing " +
          (orphan.length > 1 ? "them" : "it") +
          ". A donor cannot fill in a field that is hidden."
      );
    }

    return stop;
  }

  function blockPlatform(scope) {
    var stop = [];
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");

    if (!val(scope, "platform")) stop.push("Add your platform's name.");
    if (!isEmail(val(scope, "contact_email"))) {
      stop.push("Add a technical contact email so we can reach whoever is building the integration.");
    }
    if (!checkedList(scope, "placement").length) {
      stop.push("Pick at least one form type, or Chariot cannot tell where DAFpay should appear on your platform.");
    }

    var orphan = require.filter(function (r) {
      return show.indexOf(r) === -1;
    });
    if (orphan.length) {
      stop.push(
        "You are requiring " +
          orphan.join(", ") +
          " but not showing " +
          (orphan.length > 1 ? "them" : "it") +
          ". A donor cannot fill in a field that is hidden."
      );
    }

    return stop;
  }

  function warnNonprofit(scope) {
    var notes = [];
    var show = checkedList(scope, "show");

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
    lines.push("technical_contact_email: " + scalar(val(scope, "contact_email"), "<technical contact at your platform>"));
    lines.push("configuration_applies_to: " + scalar(val(scope, "applies_to")));
    [optional("sandbox_form_url", val(scope, "form_url")),
     optional("target_go_live", val(scope, "go_live"))
    ].forEach(function (l) { if (l) lines.push(l); });
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

    return notes;
  }

  // --- registry --------------------------------------------------------

  var BUILDERS = [
    {
      id: "chariot-setup-builder",
      email: "implementations@givechariot.com",
      // Identity in the subject so a request is routable and searchable on
      // arrival, rather than one of many identical "DAFpay setup request".
      subject: function (scope) {
        var ein = normalizeEin(val(scope, "ein"));
        return (
          "DAFpay setup request" +
          (val(scope, "organization") ? " \u2014 " + val(scope, "organization") : "") +
          (ein ? " (" + ein + ")" : "") +
          (val(scope, "applies_to") ? " \u2014 " + val(scope, "applies_to") : "")
        );
      },
      build: buildNonprofit,
      warnings: warnNonprofit,
      blockers: blockNonprofit,
    },
    {
      id: "chariot-platform-setup-builder",
      email: "integrations@givechariot.com",
      subject: function (scope) {
        return (
          "DAFpay platform setup request" +
          (val(scope, "platform") ? " \u2014 " + val(scope, "platform") : "") +
          (val(scope, "applies_to") ? " \u2014 " + val(scope, "applies_to") : "")
        );
      },
      build: buildPlatform,
      warnings: warnPlatform,
      blockers: blockPlatform,
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

    var body = spec.build(scope);
    var stop = spec.blockers ? spec.blockers(scope) : [];
    if (hasPlaceholder(body)) {
      stop = stop.concat("Replace the placeholders still shown in angle brackets before sending.");
    }

    var stopEl = scope.querySelector("[data-blockers]");
    if (stopEl) {
      stopEl.innerHTML = "";
      stopEl.hidden = stop.length === 0;
      stop.forEach(function (n) {
        var li = document.createElement("li");
        li.textContent = n;
        stopEl.appendChild(li);
      });
    }

    // An incomplete request costs the reader a round trip, so hold the actions
    // until it can actually be acted on.
    var blocked = stop.length > 0;

    var copyBtn = scope.querySelector("[data-copy]");
    if (copyBtn) {
      copyBtn.disabled = blocked;
      copyBtn.setAttribute("aria-disabled", blocked ? "true" : "false");
    }

    var mail = scope.querySelector("[data-mailto]");
    if (mail) {
      if (blocked) {
        mail.removeAttribute("href");
        mail.setAttribute("aria-disabled", "true");
      } else {
        mail.setAttribute("aria-disabled", "false");
        mail.setAttribute(
          "href",
          "mailto:" +
            spec.email +
            "?subject=" +
            encodeURIComponent(spec.subject(scope)) +
            "&body=" +
            encodeURIComponent(body)
        );
      }
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
    if (btn && btn.disabled) return;
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
