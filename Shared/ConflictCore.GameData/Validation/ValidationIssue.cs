namespace ConflictCore.GameData.Validation
{
    /// <summary>A single data problem, located by file or definition path (e.g. "units/halcyon_mbt.weapons[0]").</summary>
    public sealed class ValidationIssue
    {
        public ValidationIssue(string location, string message)
        {
            Location = location;
            Message = message;
        }

        public string Location { get; }

        public string Message { get; }

        public override string ToString() => $"{Location}: {Message}";
    }
}
