namespace ConflictCore.GameData.Definitions
{
    /// <summary>Broad unit role. Drives UI grouping, AI evaluation and default targeting priorities.</summary>
    public enum UnitClass
    {
        Infantry,
        LightVehicle,
        HeavyVehicle,
        MainBattleTank,
        TankDestroyer,
        AntiAir,
        Artillery,
        RocketArtillery,
        SupportVehicle,
        Transport,
        Helicopter,
        JetAircraft,
        Bomber,
        Drone,
        Builder,
        Harvester,
        Special,
    }

    /// <summary>How a unit moves; selects the navigation layer and movement model.</summary>
    public enum Locomotor
    {
        Foot,
        Wheeled,
        Tracked,
        Hover,
        Helicopter,
        Jet,
    }

    /// <summary>How a weapon delivers damage. Hitscan and ballistic weapons cost no per-tick projectile simulation.</summary>
    public enum WeaponDelivery
    {
        /// <summary>Instant hit (machine guns, autocannons). Visual tracers are client-only.</summary>
        Hitscan,

        /// <summary>Straight-line projectile with travel time (tank shells, rockets).</summary>
        Projectile,

        /// <summary>Homing projectile with a turn rate (ATGMs, SAMs, air-to-air).</summary>
        Missile,

        /// <summary>Arcing shell resolved at a predicted impact point (artillery). Supports minimum range.</summary>
        Ballistic,
    }

    /// <summary>Movement layer a target occupies, used by weapon target filters.</summary>
    public enum TargetLayer
    {
        Ground,
        Air,
        Structure,
    }
}
