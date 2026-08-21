package {

import flash.display.Sprite;
import flash.display.StageAlign;
import flash.display.StageScaleMode;
import flash.events.Event;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.net.navigateToURL;
import flash.text.TextField;
import flash.text.TextFormat;

/**
 * The section 16.4 acceptance test, as an actual uploadable avatar.
 *
 * This is a HOSTILE avatar on purpose. It is what a malicious user upload
 * would try to do: reach out of the Flash player, through the sandbox
 * document, and into the app's origin to steal the session or drive the page.
 * Its job is to FAIL at every one of those, and to make that failure legible
 * without a debugger.
 *
 * How it reports. Every escape runs through ExternalInterface.call("eval",
 * ...), which executes in the sandbox document's JS -- and hands the return
 * value back here. So the avatar can read the outcome of its own attack and
 * paint it: a green stage means every probe was blocked, a red stage means
 * something leaked. Per-probe lines give the detail. The stage fill is a plain
 * vector rectangle, so the pass/fail colour survives even if the fork's text
 * rendering does not.
 *
 * What "blocked" looks like, probe by probe, in the shipped opaque-origin
 * sandbox (M6 step 7):
 *
 *   - document.cookie is empty. The opaque origin has no cookie jar, so
 *     pb_auth is not here to steal.
 *   - window.top.document / window.parent.location throw SecurityError. The
 *     app is cross-origin; its DOM and URL are unreadable.
 *   - Writing window.top.* throws. The page cannot be driven.
 *   - A credentialed request to the app carries no session (no cookie jar)
 *     and cannot read a reply (CORS), so it cannot act as the user.
 *
 * Two probes cannot self-report and are for the tester to confirm on the
 * deployed build:
 *
 *   - navigateToURL("_top"): the top page must NOT navigate away. Blocked by
 *     openUrlMode:"deny" (managers/host.ts).
 *   - The eval that tries window.top.__evilAvatarBreach = 1: check in the APP
 *     page console that window.__evilAvatarBreach is undefined.
 *
 * Build with `npm run build-evil-avatar`. See
 * docs/specs/swf-avatar-rendering.md section 16.4.
 */
[SWF(width="360", height="440", backgroundColor="#000000")]
public class EvilAvatar extends Sprite
{
    private var _log :TextField;
    private var _breached :Boolean = false;

    public function EvilAvatar ()
    {
        if (stage != null) {
            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.align = StageAlign.TOP_LEFT;
        }

        _log = new TextField();
        _log.width = 360;
        _log.height = 440;
        _log.multiline = true;
        _log.wordWrap = true;
        _log.selectable = false;
        _log.defaultTextFormat = new TextFormat("_sans", 12, 0xffffff);
        addChild(_log);

        // Run after construction so the player and ExternalInterface bridge are
        // fully up. A frame is plenty.
        addEventListener(Event.ENTER_FRAME, run);
    }

    private function run (e :Event) :void
    {
        removeEventListener(Event.ENTER_FRAME, run);

        title("EVAL-PROBE avatar");
        if (!ExternalInterface.available) {
            // No bridge at all is itself a safe outcome: the avatar cannot
            // reach any JS. Colour it green and say so.
            line("ExternalInterface: UNAVAILABLE (fully contained)", true);
            paint();
            return;
        }
        line("ExternalInterface: available (expected)", true);

        // 1. Steal this document's own cookies. Opaque origin => none.
        probe(
            "own document.cookie",
            "var c=document.cookie; return c ? c : '<empty>';",
            function (r :String) :Boolean {
                return r == "<empty>" || r.indexOf("pb_auth") < 0;
            },
            "empty / no pb_auth"
        );

        // 2. Read the APP's cookies across the frame boundary.
        probe(
            "window.top.document.cookie",
            "try{return String(window.top.document.cookie);}" +
                "catch(x){return 'BLOCKED:'+(x&&x.name);}",
            isBlocked,
            "SecurityError"
        );

        // 3. Read the APP's URL.
        probe(
            "window.parent.location.href",
            "try{return String(window.parent.location.href);}" +
                "catch(x){return 'BLOCKED:'+(x&&x.name);}",
            isBlocked,
            "SecurityError"
        );

        // 4. Reach the app's globals (window.game / window.world drive it).
        probe(
            "window.top.game / world",
            "try{return typeof window.top.game+','+typeof window.top.world;}" +
                "catch(x){return 'BLOCKED:'+(x&&x.name);}",
            isBlocked,
            "SecurityError"
        );

        // 5. Write a flag onto the app page. If this ever succeeds,
        //    window.__evilAvatarBreach shows up in the APP console.
        probe(
            "write window.top.__evilAvatarBreach",
            "try{window.top.__evilAvatarBreach=1;return 'WROTE';}" +
                "catch(x){return 'BLOCKED:'+(x&&x.name);}",
            isBlocked,
            "SecurityError"
        );

        // 6. The account-takeover attempt: a credentialed request to the app,
        //    synchronous so we can read the outcome here. Blocked outcomes:
        //    a CORS/security throw, or a reply that proves no session rode
        //    along. A 200 that returns the user's record would be the breach.
        probe(
            "credentialed XHR to app /api",
            "try{" +
                "var h=document.location.href;" +
                "var b=h.indexOf('/static/')>0?h.slice(0,h.indexOf('/static/')):h;" +
                "var x=new XMLHttpRequest();" +
                "x.open('GET', b+'/api/collections/users/auth-refresh', false);" +
                "x.withCredentials=true;" +
                "x.send();" +
                "return 'STATUS:'+x.status+' len:'+String(x.responseText).length;" +
                "}catch(y){return 'BLOCKED:'+(y&&y.name);}",
            function (r :String) :Boolean {
                // A throw is blocked. A non-2xx is a rejected/unauthenticated
                // request -- also safe. Only a 2xx carrying a real token would
                // be a breach.
                if (r.indexOf("BLOCKED:") == 0) return true;
                if (r.indexOf("STATUS:200") == 0) return false;
                return true;
            },
            "throw or unauthenticated"
        );

        // 7. Drive the top window somewhere else. Cannot self-verify; the
        //    tester confirms the room did not navigate.
        var nav :String;
        try {
            navigateToURL(
                new URLRequest("https://example.com/evil-avatar-nav-probe"),
                "_top"
            );
            nav = "attempted (confirm room did NOT navigate)";
        } catch (err :Error) {
            nav = "threw in AS: " + err.errorID;
        }
        line("navigateToURL _top: " + nav, true);

        paint();
    }

    /** True when a probe result is a blocked/contained outcome. */
    private function isBlocked (r :String) :Boolean
    {
        return r.indexOf("BLOCKED:") == 0;
    }

    /**
     * Run one probe: eval `expr` in the sandbox JS, classify the result with
     * `safe`, record and colour a line. `expect` is a human hint of the safe
     * outcome.
     */
    private function probe (
        name :String, expr :String, safe :Function, expect :String) :void
    {
        var result :String;
        try {
            result = String(
                ExternalInterface.call("eval", "(function(){" + expr + "})()")
            );
        } catch (e :Error) {
            // A throw crossing back into AS is also containment.
            result = "BLOCKED:AS#" + e.errorID;
        }
        if (result == null) {
            result = "null";
        }
        var ok :Boolean = safe(result);
        if (!ok) {
            _breached = true;
        }
        line(
            (ok ? "[BLOCKED] " : "[LEAKED!] ") + name + "\n    -> " +
                clip(result) + (ok ? "" : "  (expected " + expect + ")"),
            ok
        );
    }

    private function clip (s :String) :String
    {
        return s.length > 90 ? s.substr(0, 90) + "..." : s;
    }

    private function title (s :String) :void
    {
        _log.appendText(s + "\n\n");
    }

    private function line (s :String, ok :Boolean) :void
    {
        // Colour the run of text for this line.
        var start :int = _log.text.length;
        _log.appendText(s + "\n");
        var fmt :TextFormat = new TextFormat();
        fmt.color = ok ? 0x9fe6a0 : 0xff8a80;
        _log.setTextFormat(fmt, start, _log.text.length);
    }

    /** Fill the stage: green if fully contained, red if anything leaked. */
    private function paint () :void
    {
        var w :Number = 360;
        var h :Number = 440;
        graphics.clear();
        graphics.beginFill(_breached ? 0x7f1515 : 0x14431a, 1);
        graphics.drawRect(0, 0, w, h);
        graphics.endFill();
        // Keep the text on top.
        setChildIndex(_log, numChildren - 1);

        var banner :String = _breached
            ? ">>> SANDBOX BREACHED <<<"
            : ">>> CONTAINED - all probes blocked <<<";
        var start :int = _log.text.length;
        _log.appendText("\n" + banner + "\n");
        var fmt :TextFormat = new TextFormat("_sans", 14, 0xffffff, true);
        _log.setTextFormat(fmt, start, _log.text.length);
    }
}
}
