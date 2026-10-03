namespace ConflictCore.Core.Hashing
{
    /// <summary>
    /// Incremental 64-bit FNV-1a hash used for simulation state checksums (desync detection, replay
    /// verification, golden-value tests). Not cryptographic. A mutable struct so it can be passed by
    /// <c>ref</c> through hot paths without allocating.
    /// </summary>
    public struct StateHasher
    {
        private const ulong OffsetBasis = 14695981039346656037UL;
        private const ulong Prime = 1099511628211UL;

        private ulong _hash;
        private bool _started;

        public ulong Value => _started ? _hash : OffsetBasis;

        public void Add(byte value)
        {
            if (!_started)
            {
                _hash = OffsetBasis;
                _started = true;
            }

            _hash = unchecked((_hash ^ value) * Prime);
        }

        public void Add(uint value)
        {
            Add((byte)value);
            Add((byte)(value >> 8));
            Add((byte)(value >> 16));
            Add((byte)(value >> 24));
        }

        public void Add(int value) => Add(unchecked((uint)value));

        public void Add(long value)
        {
            Add(unchecked((uint)value));
            Add(unchecked((uint)(value >> 32)));
        }

        public void Add(ulong value) => Add(unchecked((long)value));

        public void Add(bool value) => Add(value ? (byte)1 : (byte)0);
    }
}
