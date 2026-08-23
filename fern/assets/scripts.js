/*
 * Connect setup request builder.
 *
 * Powers the picker on the "Configure and Request Your Connect" guide page:
 * the reader selects their options, and we assemble a YAML block they can copy
 * or send straight to integrations@givechariot.com.
 *
 * The docs are a client-routed SPA, so this uses event delegation on `document`
 * plus a MutationObserver rather than per-element listeners, so it keeps
 * working when Fern re-renders or the reader navigates back to the page.
 *
 * Progressive enhancement: the page ships a valid default block inside the
 * output element, so if this script never runs the reader still has a usable
 * template to copy by hand.
 */
(function () {
  "use strict";

  var ROOT_ID = "chariot-setup-builder";
  var REQUEST_EMAIL = "integrations@givechariot.com";

  function root() {
    return document.getElementById(ROOT_ID);
  }

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

  function build(scope) {
    var show = checkedList(scope, "show");
    var require = checkedList(scope, "require");
    var closeOnConfirm = val(scope, "close_window");

    var lines = [];
    lines.push("organization: " + scalar(val(scope, "organization"), "<your nonprofit's name>"));
    lines.push("environment: " + scalar(val(scope, "environment")));
    lines.push("");
    lines.push("connect:");
    lines.push("  donor_details_step: " + scalar(val(scope, "donor_step")));
    lines.push("  details_to_show: [" + (show.length ? show.join(", ") : "<none selected>") + "]");
    lines.push("  details_to_require: [" + (require.length ? require.join(", ") : "<none>") + "]");
    lines.push("  monthly_recurring_gifts: " + scalar(val(scope, "recurring")));
    lines.push("  unconnected_daf_providers: " + scalar(val(scope, "unconnected")));
    lines.push("  close_window_on_confirm: " + scalar(closeOnConfirm));
    if (closeOnConfirm === "yes") {
      lines.push("  # confirmed: our page shows tracking ID, EIN, org name, provider link");
    }
    lines.push("");
    lines.push("qa:");
    lines.push("  test_form_url: " + scalar(val(scope, "test_form_url"), "<link to your form running the sandbox connect>"));
    lines.push("  target_go_live: " + scalar(val(scope, "go_live"), "<date>"));

    return lines.join("\n") + "\n";
  }

  function warnings(scope) {
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

  function render() {
    var scope = root();
    if (!scope) return;

    var out = scope.querySelector("[data-output]");
    if (out) out.textContent = build(scope);

    var notesEl = scope.querySelector("[data-warnings]");
    if (notesEl) {
      var notes = warnings(scope);
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
          REQUEST_EMAIL +
          "?subject=" +
          encodeURIComponent("DAFpay setup request") +
          "&body=" +
          encodeURIComponent(build(scope))
      );
    }
  }

  function flash(btn, message) {
    var original = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", original);
    btn.textContent = message;
    setTimeout(function () {
      btn.textContent = btn.getAttribute("data-label") || original;
    }, 1600);
  }

  function copy(scope, btn) {
    var text = build(scope);

    function fallback() {
      // Older browsers, and any context where the async clipboard API is
      // unavailable (e.g. a non-secure origin during local preview).
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      flash(btn, ok ? "Copied" : "Press ⌘C to copy");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          flash(btn, "Copied");
        },
        fallback
      );
    } else {
      fallback();
    }
  }

  document.addEventListener("input", function (e) {
    if (e.target.closest && e.target.closest("#" + ROOT_ID)) render();
  });

  document.addEventListener("change", function (e) {
    if (e.target.closest && e.target.closest("#" + ROOT_ID)) render();
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-copy]");
    if (!btn) return;
    var scope = root();
    if (!scope) return;
    e.preventDefault();
    copy(scope, btn);
  });

  // Render as soon as the builder exists, and again whenever the SPA swaps it in.
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
