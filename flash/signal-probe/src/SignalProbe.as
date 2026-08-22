package {

import flash.display.Sprite;
import flash.events.Event;

/**
 * Room-interaction probe avatar for spec section 16.4.
 *
 * Two of these in one room re-run the section 15.4 verification table from
 * inside the AVM, which is the only place the room-awareness calls can
 * originate. The battery is modeled on DuelingLandSeaAnimal.as — the avatar
 * that defines what the registry has to support — and reproduces its three
 * load-bearing mechanics:
 *
 *   - Reading your OWN property through the host. LSA reads its own
 *     PROP_LOCATION_PIXEL via getEntityProperty(key, myId), which the shim
 *     routes to the avatar's own provider — so, like the real SDK's
 *     EntityControl, this provider answers std:location_pixel itself, from
 *     the appearanceChanged cache times getRoomBounds.
 *
 *   - The kill: a property read as a remote procedure call. Reading
 *     "probe:kill" on another instance makes THAT instance's provider
 *     re-read its own duel state (a nested self-read) and call setState on
 *     itself — all inside the asking avatar's synchronous query, exactly
 *     LSA's "landseaanimal:IKillJoo".
 *
 *   - The death notice: sendSignal with an Object payload, guarded by
 *     hasControl(), delivered to every avatar in the room including the
 *     sender.
 *
 * No SDK .swc is linked; the controlConnect handshake is spoken by hand in
 * the newer (AbstractControl) shape, which the whirled-host shim answers.
 * Everything observed is recorded and returned as JSON through the shim's
 * whirledLookupProperty("probe:results"), so the driving page can read the
 * verdict out through the sandbox boundary it is testing.
 *
 * Driven by a throwaway page (see the spec); the battery runs when the page
 * sends the message "probe:run".
 */
public class SignalProbe extends Sprite
{
    public function SignalProbe ()
    {
        // Something to render, so the draw stream has pixels in it.
        graphics.beginFill(0x2266cc);
        graphics.drawRect(0, 0, 120, 160);
        graphics.endFill();
        graphics.beginFill(0xffffff);
        graphics.drawCircle(60, 50, 24);
        graphics.endFill();

        if (loaderInfo != null) {
            connect();
        } else {
            addEventListener(Event.ENTER_FRAME, handleFirstFrame);
        }
    }

    protected function handleFirstFrame (event :Event) :void
    {
        if (loaderInfo == null) {
            return;
        }
        removeEventListener(Event.ENTER_FRAME, handleFirstFrame);
        connect();
    }

    /**
     * The AbstractControl-vintage handshake: dispatch controlConnect on
     * sharedEvents carrying { props: { userProps } }; the host assigns
     * props.hostProps during dispatch (the props object is shared by
     * reference, so a clone still reaches us).
     */
    protected function connect () :void
    {
        var event :ConnectEvent = new ConnectEvent();
        event.props = { userProps: buildUserProps() };
        loaderInfo.sharedEvents.dispatchEvent(event);
        _host = event.props.hostProps;
        log("handshake", _host != null);
    }

    protected function buildUserProps () :Object
    {
        var props :Object = new Object();
        // Member methods, not anonymous closures: an anonymous function's
        // `this` is not the instance in AS3.
        props["gotControl_v1"] = gotControl;
        props["stateSet_v1"] = stateSet;
        props["getStates_v1"] = getStates;
        props["getActions_v1"] = getActions;
        props["appearanceChanged_v1"] = appearanceChanged;
        props["entityEntered_v1"] = entityEntered;
        props["entityLeft_v1"] = entityLeft;
        props["entityMoved_v2"] = entityMoved;
        props["signalReceived_v1"] = signalReceived;
        props["messageReceived_v1"] = messageReceived;
        props["lookupEntityProperty_v1"] = lookupProperty;
        return props;
    }

    // ------------------------------------------------------- host -> avatar

    protected function gotControl () :void
    {
        _hasControl = true;
        log("gotControl", null);
    }

    protected function stateSet (state :String = null) :void
    {
        _state = state;
        log("stateSet", state);
    }

    protected function getStates () :Array
    {
        return [ "default", "duel", "dead" ];
    }

    protected function getActions () :Array
    {
        return [ "probe:duel" ];
    }

    protected function appearanceChanged (
        location :Array = null, orient :Number = 0,
        moving :Boolean = false) :void
    {
        _location = location;
        _orient = orient;
    }

    protected function entityEntered (entityId :String = null) :void
    {
        log("entityEntered", entityId);
    }

    protected function entityLeft (entityId :String = null) :void
    {
        log("entityLeft", entityId);
    }

    protected function entityMoved (
        entityId :String = null, location :Array = null) :void
    {
        log("entityMoved", [ entityId, location ]);
    }

    protected function signalReceived (
        name :String = null, arg :Object = null) :void
    {
        log("signal", [ name, arg ]);
    }

    protected function messageReceived (
        name :String = null, arg :Object = null,
        isAction :Boolean = false) :void
    {
        if (name == "probe:run") {
            runBattery();
            return;
        }
        log(isAction ? "action" : "message", [ name, arg ]);
    }

    /**
     * The property provider. "probe:kill" is the LSA kill reproduced: the
     * nested self-read and the setState both happen inside the caller's
     * synchronous getEntityProperty.
     */
    protected function lookupProperty (key :String = null) :Object
    {
        switch (key) {
        case "probe:results":
            return JSON.stringify({
                results: _results, log: _log, kills: _kills });

        case "probe:inDuelState":
            return _state == "duel";

        case "probe:kill":
            if (hostCall("getEntityProperty_v1", null, "probe:inDuelState")) {
                _kills++;
                hostCall("setState_v1", "dead");
            }
            return null;

        case "std:location_pixel":
            // The SDK answers its own std: keys from its appearance cache;
            // real avatars (LSA included) read their own location this way.
            var bounds :Array = hostCall("getRoomBounds_v1") as Array;
            if (_location == null || bounds == null) {
                return null;
            }
            return [
                Number(_location[0]) * Number(bounds[0]),
                Number(_location[1]) * Number(bounds[1]),
                Number(_location[2]) * Number(bounds[2])
            ];
        }
        return null;
    }

    // ------------------------------------------------------------ the probe

    /** The section 15.4 table, asked from inside the AVM, LSA-style. */
    protected function runBattery () :void
    {
        var r :Object = new Object();
        r.myId = hostCall("getMyEntityId_v1");
        r.avatars = hostCall("getEntityIds_v1", "avatar");
        r.furni = hostCall("getEntityIds_v1", "furni");

        // Self-reads route to our own provider, like LSA reading its own
        // duel state and pixel location.
        r.selfDuel = hostCall("getEntityProperty_v1", null,
            "probe:inDuelState");
        r.selfPixel = hostCall("getEntityProperty_v1", String(r.myId),
            "std:location_pixel");

        var other :String = null;
        var ids :Array = r.avatars as Array;
        if (ids != null) {
            for each (var id :String in ids) {
                if (id != r.myId) {
                    other = id;
                    break;
                }
            }
        }
        r.otherId = other;

        if (other != null) {
            // Cross-entity reads: std: keys the room answers, custom keys
            // the other avatar's live provider answers.
            r.otherDuel = hostCall("getEntityProperty_v1", other,
                "probe:inDuelState");
            r.otherPixel = hostCall("getEntityProperty_v1", other,
                "std:location_pixel");
            r.otherLogical = hostCall("getEntityProperty_v1", other,
                "std:location_logical");
            r.otherType = hostCall("getEntityProperty_v1", other,
                "std:type");
            r.otherDims = hostCall("getEntityProperty_v1", other,
                "std:dimensions");

            // The kill. The other instance dies inside this call.
            r.kill = hostCall("getEntityProperty_v1", other, "probe:kill");

            // LSA's guard, verbatim: only an instance with control sends
            // the notice. Object payload on purpose.
            if (_hasControl) {
                hostCall("sendSignal_v1", "probe:deathNotice",
                    { killer: r.myId, killee: other });
            }
        }

        r.missing = hostCall("getEntityProperty_v1", "no-such-entity",
            "std:type");
        hostCall("sendMessage_v1", "probe:note", r.myId);

        _results = r;
        log("batteryDone", null);
    }

    // -------------------------------------------------------------- plumbing

    protected function hostCall (name :String, ... args) :Object
    {
        if (_host == null) {
            return null;
        }
        var fn :Function = _host[name] as Function;
        if (fn == null) {
            return null;
        }
        try {
            return fn.apply(null, args);
        } catch (e :Error) {
            log("hostCallError", name + ": " + e.message);
        }
        return null;
    }

    protected function log (type :String, value :Object) :void
    {
        _log.push({ t: type, v: value });
    }

    protected var _host :Object;
    protected var _hasControl :Boolean = false;
    protected var _state :String = null;
    protected var _location :Array = null;
    protected var _orient :Number = 0;
    protected var _results :Object = null;
    protected var _log :Array = [];
    protected var _kills :int = 0;
}
}

import flash.events.Event;

/**
 * The handshake event. Dynamic so `props` can ride on it; the clone shares
 * `props` by reference, which is what lets the host's hostProps assignment
 * reach the original — the same shape AbstractControl uses.
 */
dynamic class ConnectEvent extends Event
{
    public function ConnectEvent ()
    {
        super("controlConnect", false, false);
    }

    override public function clone () :Event
    {
        var event :ConnectEvent = new ConnectEvent();
        event.props = this.props;
        return event;
    }
}
