package {

import flash.display.DisplayObject;
import flash.display.Loader;
import flash.display.Sprite;
import flash.display.StageAlign;
import flash.display.StageScaleMode;
import flash.events.Event;
import flash.events.IOErrorEvent;
import flash.external.ExternalInterface;
import flash.net.URLRequest;
import flash.system.ApplicationDomain;
import flash.system.LoaderContext;
import flash.system.SecurityDomain;

/**
 * Host shim for Whirled SDK avatars.
 *
 * Ruffle loads *this* SWF, not the avatar. It loads the avatar itself, answers
 * the Whirled SDK's connection handshake, and exposes one fixed
 * ExternalInterface surface that is the same for every avatar. That removes
 * the need to hand-patch each uploaded file with its own
 * ExternalInterface.addCallback calls.
 *
 * The handshake: on construction the avatar's control dispatches a
 * "controlConnect" event on root.loaderInfo.sharedEvents. The control supplies
 * userProps (functions the host may call); the host supplies hostProps
 * (functions the avatar may call).
 *
 * Two SDK vintages exist in the wild and differ in how the event carries them:
 *
 *   com.whirled.WhirledControl   event.userProps / event.hostProps
 *   com.whirled.AbstractControl  event.props.userProps / event.props.hostProps
 *
 * Both are supported; see handleControlConnect. They also differ in arity of
 * appearanceChanged (_v1 has no `sleeping` flag), handled in setAppearance.
 *
 * Note the direction of travel, which is easy to get backwards:
 *
 *   host -> avatar   userProps.appearanceChanged_v1/v2(location, orient, moving[, sleeping])
 *                    userProps.stateSet_v1(state)
 *
 *   avatar -> host   hostProps.setState_v1(state)
 *                    hostProps.setOrientation_v1(orient)
 *                    hostProps.setLocation_v1(x, y, z, orient)
 *                    hostProps.setMoveSpeed_v1(pixelsPerSecond)
 *                    hostProps.setPreferredY_v1(pixels)
 *                    hostProps.setHotSpot_v1(x, y, height)
 *
 * So driving an avatar means telling it its appearance changed, not calling a
 * setter on it. The avatar's own code listens for the resulting ControlEvent
 * and moves its timeline accordingly.
 *
 * See docs/specs/swf-avatar-rendering.md (W1).
 */
public class WhirledHost extends Sprite
{
    public function WhirledHost ()
    {
        if (stage != null) {
            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.align = StageAlign.TOP_LEFT;
            stage.addEventListener(Event.RESIZE, function (e :Event) :void {
                layoutAvatar();
            });
        }

        registerExternalInterface();

        var url :String = null;
        if (loaderInfo != null && loaderInfo.parameters != null) {
            url = loaderInfo.parameters["avatar"] as String;
            // Every player in the page shares one JS global namespace, so an
            // event has to say which avatar it came from. The host passes the
            // entity id in as a flashvar and gets it back on every event.
            var id :String = loaderInfo.parameters["hostId"] as String;
            if (id != null) {
                _hostId = id;
            }
        }
        if (url != null && url.length > 0) {
            loadAvatar(url);
        }
    }

    /**
     * Load the avatar SWF and listen for its control handshake.
     *
     * The listener must be attached before the load begins: the avatar's
     * control dispatches controlConnect from its own constructor, which runs
     * as soon as the content is initialized.
     */
    public function loadAvatar (url :String) :void
    {
        if (_loader != null) {
            unloadAvatar();
        }

        _loader = new Loader();

        // sharedEvents is the EventDispatcher common to loader and loadee, and
        // is where AbstractControl dispatches the handshake.
        _loader.contentLoaderInfo.sharedEvents.addEventListener(
            CONTROL_CONNECT, handleControlConnect);
        _loader.contentLoaderInfo.addEventListener(
            Event.INIT, handleInit);
        _loader.contentLoaderInfo.addEventListener(
            IOErrorEvent.IO_ERROR, handleIoError);

        addChild(_loader);

        // Give the avatar its own ApplicationDomain so its class definitions
        // cannot collide with ours, and so two avatars cannot collide with
        // each other.
        var context :LoaderContext = new LoaderContext(
            false, new ApplicationDomain(null));

        _loader.load(new URLRequest(url), context);
    }

    public function unloadAvatar () :void
    {
        if (_loader == null) {
            return;
        }
        try {
            _loader.close();
        } catch (e :Error) {
            // Already finished loading; nothing to close.
        }
        _loader.unloadAndStop();
        if (contains(_loader)) {
            removeChild(_loader);
        }
        _loader = null;
        _userProps = null;
        _connected = false;
    }

    // ---------------------------------------------------------------- events

    /**
     * Answer the SDK's connection handshake.
     *
     * Assigning hostProps on the event we were handed works even though
     * dispatchEvent gives each listener a clone. Both vintages account for it:
     * WhirledControl's ConnectEvent.clone() keeps a _parent link whose
     * hostProps setter forwards to the original, and AbstractControl's clone
     * shares the same `props` object by reference.
     *
     * Verified by decompiling com.whirled out of real avatars with FFDec
     * rather than from the SDK on GitHub, which only matches the newer one.
     */
    protected function handleControlConnect (event :Event) :void
    {
        var connect :Object = Object(event);

        // Two SDK vintages are in the wild and they shape the event
        // differently. Reading the wrong one throws ReferenceError #1069, so
        // probe rather than guess.
        if ("props" in connect && connect.props != null) {
            // Newer: com.whirled.AbstractControl. Nested under `props`, and
            // carries an `alreadyConnected` flag the control throws on — so
            // never set it.
            var props :Object = connect.props;
            _userProps = props.userProps;
            props.hostProps = createHostProps();
            _sdkVintage = "AbstractControl";
        } else {
            // Older: com.whirled.WhirledControl. Directly on the event, with
            // hostProps forwarding through clone()'s _parent link.
            _userProps = connect.userProps;
            connect.hostProps = createHostProps();
            _sdkVintage = "WhirledControl";
        }

        _connected = true;

        // Seed the avatar's appearance immediately.
        //
        // ActorControl caches location/orientation/moving locally, and
        // getLogicalLocation() returns that cache directly rather than asking
        // the host. Until something calls appearanceChanged, the cache is
        // null, and avatars that read it crash with
        // "#1009 ... (accessing field: 1)" — which is exactly what
        // kawaii_v2's updateLook() does on its very first frame.
        //
        // We can fix that for every avatar because this handshake runs inside
        // the control's own constructor, before the avatar's code gets a turn.
        // The avatar has not registered its ControlEvent listeners yet, so
        // this seeding dispatches into nothing and is purely a cache fill.
        setAppearance(0, 0, 0, _orient, false, false);

        notifyHost("connected", _sdkVintage);
    }

    protected function handleInit (event :Event) :void
    {
        _content = _loader.content;

        // The avatar's own stage size, before any scaling we apply. This is
        // the only place it is knowable: Ruffle's metadata describes this
        // shim, not the SWF the shim loaded.
        _naturalWidth = _loader.contentLoaderInfo.width;
        _naturalHeight = _loader.contentLoaderInfo.height;
        layoutAvatar();
        notifyHost("stageSize", [ _naturalWidth, _naturalHeight ]);

        // An avatar that never constructs a control is still perfectly
        // renderable; it just cannot be driven. Report which case we are in so
        // the client can pick a control tier.
        notifyHost("loaded", _connected);
    }

    protected function handleIoError (event :IOErrorEvent) :void
    {
        notifyHost("error", event.text);
    }

    // ------------------------------------------------------- host -> avatar

    /**
     * Tell the avatar its appearance changed. This is how the room makes an
     * avatar walk and turn.
     *
     * location is [x, y, z] as a fraction of room size, matching the SDK.
     */
    public function setAppearance (
        x :Number, y :Number, z :Number, orient :Number, moving :Boolean,
        sleeping :Boolean) :void
    {
        // The SDK version compiled into an avatar decides which of these
        // exists, and they differ in arity: _v2 takes a trailing `sleeping`
        // flag, _v1 does not. Real avatars in our corpus are _v1; the current
        // whirled-sdk on GitHub is _v2. Support both rather than betting.
        if (hasAvatarFunc("appearanceChanged_v2")) {
            callAvatar("appearanceChanged_v2", [ x, y, z ], orient, moving, sleeping);
        } else {
            callAvatar("appearanceChanged_v1", [ x, y, z ], orient, moving);
        }
    }

    /**
     * Tell the avatar its state changed (idle, walking, and so on).
     *
     * The host is the authority on current state, so record it before
     * notifying. Avatars typically respond to STATE_CHANGED by calling
     * getState() straight back, which round-trips to our getState_v1 — if we
     * had not stored it first they would read back the previous value and
     * appear not to react at all.
     */
    public function setState (state :String) :void
    {
        _state = state;
        callAvatar("stateSet_v1", state);
    }

    /** The states this avatar registered via AvatarControl.registerStates. */
    public function getStates () :Array
    {
        var states :Object = callAvatar("getStates_v1");
        return (states as Array) || [];
    }

    /** The actions this avatar registered via AvatarControl.registerActions. */
    public function getActions () :Array
    {
        var actions :Object = callAvatar("getActions_v1");
        return (actions as Array) || [];
    }

    /**
     * Trigger one of the avatar's registered actions.
     *
     * The stock SDK gives the host no dedicated verb for this: actions arrive
     * through the same path as messages, with the trailing flag deciding which
     * event the avatar dispatches. `EntityControl.messageReceived_v1(name,
     * arg, isAction)` dispatches ACTION_TRIGGERED when `isAction` is true.
     * The hand-patched avatars exposed a `playAction` callback instead, which
     * is the shortcut this replaces.
     */
    public function playAction (action :String) :void
    {
        callAvatar("messageReceived_v1", action, null, true);
    }

    /** Tell the avatar the wearer spoke, so it can animate its mouth. */
    public function avatarSpoke () :void
    {
        callAvatar("avatarSpoke_v1");
    }

    // ------------------------------------------------------- avatar -> host

    /**
     * The functions the avatar may call on us.
     *
     * Anything absent from this object simply returns undefined on the avatar
     * side — AbstractControl.callHostCode traces a warning rather than
     * throwing — so a partial implementation degrades instead of breaking.
     */
    protected function createHostProps () :Object
    {
        var host :Object = new Object();

        host["setState_v1"] = function (state :String) :void {
            _state = state;
            notifyHost("setState", state);
        };
        host["getState_v1"] = function () :String {
            // Before anything sets a state, report the avatar's own first
            // registered state rather than an empty string, which some
            // avatars treat as an unknown state and render blank for.
            if (_state == null || _state == "") {
                var states :Array = getStates();
                if (states.length > 0) {
                    return states[0] as String;
                }
            }
            return _state;
        };
        host["setOrientation_v1"] = function (orient :Number) :void {
            _orient = orient;
            notifyHost("setOrientation", orient);
        };
        host["setLocation_v1"] = function (
            x :Number, y :Number, z :Number, orient :Number) :void {
            notifyHost("setLocation", [ x, y, z, orient ]);
        };
        host["setMoveSpeed_v1"] = function (pixelsPerSecond :Number) :void {
            notifyHost("setMoveSpeed", pixelsPerSecond);
        };

        // This is the one that replaces the client's CPU alpha scan: the
        // avatar tells us how far above the floor it wants to sit.
        host["setPreferredY_v1"] = function (pixels :int) :void {
            _preferredY = pixels;
            notifyHost("setPreferredY", pixels);
        };
        host["setHotSpot_v1"] = function (
            x :Number, y :Number, height :Number) :void {
            notifyHost("setHotSpot", [ x, y, height ]);
        };

        // Room queries the avatar may make. We answer with benign defaults
        // rather than leaving them undefined, since some avatars use the
        // result without checking.
        host["getRoomBounds_v1"] = function () :Array {
            return [ _roomWidth, _roomHeight ];
        };
        host["getViewerName_v1"] = function () :String {
            return _viewerName;
        };
        host["getInstanceId_v1"] = function () :int {
            return 0;
        };
        host["canEditRoom_v1"] = function () :Boolean {
            return false;
        };
        host["isSleeping_v1"] = function () :Boolean {
            return false;
        };

        return host;
    }

    // -------------------------------------------------------------- plumbing

    /**
     * Scale the avatar to fill the viewport, preserving its aspect.
     *
     * The stage is NO_SCALE, so content would otherwise draw at 1:1 in a
     * viewport of whatever size the embedding page chose, leaving the render
     * target mostly empty and the avatar rendered at a fixed resolution. The
     * host sizes its element to the avatar's aspect (see whirledGetStageSize)
     * and this stretches to meet it, which is what lets the client pick the
     * texel density.
     */
    protected function layoutAvatar () :void
    {
        if (_loader == null || _naturalWidth <= 0 || _naturalHeight <= 0 ||
            stage == null) {
            return;
        }
        var scale :Number = Math.min(
            stage.stageWidth / _naturalWidth,
            stage.stageHeight / _naturalHeight);
        if (scale <= 0 || !isFinite(scale)) {
            return;
        }
        _loader.scaleX = scale;
        _loader.scaleY = scale;
        _loader.x = (stage.stageWidth - _naturalWidth * scale) / 2;
        _loader.y = (stage.stageHeight - _naturalHeight * scale) / 2;
    }

    /** The loaded avatar's natural stage size, as [width, height]. */
    public function getStageSize () :Array
    {
        return [ _naturalWidth, _naturalHeight ];
    }

    /** Whether the avatar registered a given userProps function. */
    protected function hasAvatarFunc (name :String) :Boolean
    {
        return _userProps != null && (_userProps[name] as Function) != null;
    }

    /** Invoke one of the avatar's userProps functions, if it registered it. */
    protected function callAvatar (name :String, ... args) :Object
    {
        if (_userProps == null) {
            return undefined;
        }
        var func :Function = _userProps[name] as Function;
        if (func == null) {
            return undefined;
        }
        try {
            return func.apply(null, args);
        } catch (e :Error) {
            notifyHost("error", name + ": " + e.message);
        }
        return undefined;
    }

    /**
     * The fixed ExternalInterface surface. Identical for every avatar, which
     * is the entire point of this shim.
     */
    protected function registerExternalInterface () :void
    {
        if (!ExternalInterface.available) {
            return;
        }
        try {
            ExternalInterface.addCallback("whirledLoadAvatar", loadAvatar);
            ExternalInterface.addCallback("whirledUnloadAvatar", unloadAvatar);
            ExternalInterface.addCallback("whirledSetAppearance", setAppearance);
            ExternalInterface.addCallback("whirledSetState", setState);
            ExternalInterface.addCallback("whirledGetStates", getStates);
            ExternalInterface.addCallback("whirledGetActions", getActions);
            ExternalInterface.addCallback("whirledPlayAction", playAction);
            ExternalInterface.addCallback("whirledAvatarSpoke", avatarSpoke);
            ExternalInterface.addCallback("whirledIsConnected", isConnected);
            ExternalInterface.addCallback("whirledGetPreferredY", getPreferredY);
            ExternalInterface.addCallback("whirledSetRoomBounds", setRoomBounds);
            ExternalInterface.addCallback("whirledSetViewerName", setViewerName);
            ExternalInterface.addCallback("whirledGetStageSize", getStageSize);
            ExternalInterface.addCallback("whirledGetCapabilities", getCapabilities);
            ExternalInterface.addCallback("whirledGetSdkVintage", getSdkVintage);
        } catch (e :Error) {
            // Ruffle without script access, or a security sandbox that
            // disallows it. The avatar still renders; it just cannot be driven.
        }
    }

    /** Push an event up to JS. Best-effort; never throws. */
    protected function notifyHost (type :String, value :Object = null) :void
    {
        if (!ExternalInterface.available) {
            return;
        }
        try {
            ExternalInterface.call("whirledHostEvent", _hostId, type, value);
        } catch (e :Error) {
            // No listener on the JS side yet, or script access is off.
        }
    }

    public function isConnected () :Boolean
    {
        return _connected;
    }

    /**
     * Which userProps functions this particular avatar actually registered.
     *
     * SDK vintages differ (see setAppearance), so the client should ask rather
     * than assume. Returned as a plain object so it crosses ExternalInterface
     * as a JS object.
     */
    /** "WhirledControl", "AbstractControl", or "" if never connected. */
    public function getSdkVintage () :String
    {
        return _sdkVintage;
    }

    public function getCapabilities () :Object
    {
        var caps :Object = new Object();
        if (_userProps == null) {
            return caps;
        }
        var names :Array = [
            "appearanceChanged_v1", "appearanceChanged_v2", "stateSet_v1",
            "getStates_v1", "getActions_v1", "avatarSpoke_v1"
        ];
        for (var i :int = 0; i < names.length; i++) {
            caps[names[i]] = hasAvatarFunc(names[i] as String);
        }
        return caps;
    }

    public function getPreferredY () :int
    {
        return _preferredY;
    }

    public function setRoomBounds (width :Number, height :Number) :void
    {
        _roomWidth = width;
        _roomHeight = height;
    }

    public function setViewerName (name :String) :void
    {
        _viewerName = name;
    }

    protected var _loader :Loader;
    protected var _content :DisplayObject;
    protected var _userProps :Object;
    protected var _connected :Boolean = false;

    protected var _state :String = "";
    protected var _orient :Number = 0;
    protected var _preferredY :int = 0;
    protected var _roomWidth :Number = 700;
    protected var _roomHeight :Number = 500;
    protected var _viewerName :String = "Guest";

    /** Which SDK base class this avatar was built against; "" until connected. */
    protected var _sdkVintage :String = "";

    /** Identifies this player to JS; see the hostId flashvar. */
    protected var _hostId :String = "";

    protected var _naturalWidth :Number = 0;
    protected var _naturalHeight :Number = 0;

    /** The event name AbstractControl dispatches on sharedEvents. */
    protected static const CONTROL_CONNECT :String = "controlConnect";
}
}
