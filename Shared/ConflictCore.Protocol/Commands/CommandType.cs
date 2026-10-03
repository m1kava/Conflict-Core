namespace ConflictCore.Protocol.Commands
{
    /// <summary>
    /// Player intents. Clients never send results ("unit X is now at Y", "I have 5000 credits"); they send
    /// what they want, and the authoritative server decides what happens. Values are part of the wire format.
    /// </summary>
    public enum CommandType : byte
    {
        Move = 0,
        AttackMove = 1,
        Attack = 2,
        Stop = 3,
        HoldPosition = 4,
        Guard = 5,
        Patrol = 6,
        Repair = 7,
        EnterTransport = 8,
        Unload = 9,
        Capture = 10,
        UseAbility = 11,
        PlaceBuilding = 12,
        QueueProduction = 13,
        CancelProduction = 14,
        SetRallyPoint = 15,
        Sell = 16,
        Research = 17,
        TogglePower = 18,
        Surrender = 19,
    }

    /// <summary>What a command points at.</summary>
    public enum CommandTargetKind : byte
    {
        None = 0,
        Position = 1,
        Entity = 2,
    }

    /// <summary>Ground formation requested for group movement; slot assignment happens on the server.</summary>
    public enum FormationKind : byte
    {
        Auto = 0,
        Grid = 1,
        Line = 2,
        Wedge = 3,
        Spread = 4,
    }
}
