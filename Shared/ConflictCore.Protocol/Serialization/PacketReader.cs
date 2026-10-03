using System;
using ConflictCore.Core.Numerics;

namespace ConflictCore.Protocol.Serialization
{
    /// <summary>
    /// Bounds-checked reader for untrusted network input. Every read validates remaining length and every
    /// variable-size field takes an explicit maximum, so a hostile packet can neither read out of bounds nor
    /// force a large allocation. Violations throw <see cref="ProtocolException"/>.
    /// </summary>
    public struct PacketReader
    {
        private const int MaxVarUIntBytes = 5;

        private readonly byte[] _buffer;
        private readonly int _end;
        private int _position;

        public PacketReader(ArraySegment<byte> data)
        {
            _buffer = data.Array ?? throw new ArgumentException("Segment has no backing array.", nameof(data));
            _position = data.Offset;
            _end = data.Offset + data.Count;
        }

        public int Remaining => _end - _position;

        public bool IsAtEnd => _position == _end;

        public byte ReadByte()
        {
            Require(1);
            return _buffer[_position++];
        }

        public bool ReadBool()
        {
            byte value = ReadByte();
            if (value > 1)
            {
                throw new ProtocolException($"Invalid boolean byte {value}.");
            }

            return value == 1;
        }

        public ushort ReadUInt16()
        {
            Require(2);
            ushort value = (ushort)(_buffer[_position] | (_buffer[_position + 1] << 8));
            _position += 2;
            return value;
        }

        public uint ReadUInt32()
        {
            Require(4);
            uint value = (uint)(_buffer[_position]
                | (_buffer[_position + 1] << 8)
                | (_buffer[_position + 2] << 16)
                | (_buffer[_position + 3] << 24));
            _position += 4;
            return value;
        }

        public ulong ReadUInt64()
        {
            ulong low = ReadUInt32();
            ulong high = ReadUInt32();
            return low | (high << 32);
        }

        public uint ReadVarUInt()
        {
            uint result = 0;
            for (int i = 0; i < MaxVarUIntBytes; i++)
            {
                byte next = ReadByte();
                if (i == MaxVarUIntBytes - 1 && next > 0x0F)
                {
                    throw new ProtocolException("VarUInt overflows 32 bits.");
                }

                result |= (uint)(next & 0x7F) << (7 * i);
                if ((next & 0x80) == 0)
                {
                    return result;
                }
            }

            throw new ProtocolException("VarUInt is too long.");
        }

        public int ReadVarInt()
        {
            uint zigZag = ReadVarUInt();
            return (int)(zigZag >> 1) ^ -(int)(zigZag & 1);
        }

        /// <summary>Reads a varint and rejects it unless it lies in [0, <paramref name="maxInclusive"/>].</summary>
        public int ReadBoundedCount(int maxInclusive)
        {
            uint value = ReadVarUInt();
            if (value > (uint)maxInclusive)
            {
                throw new ProtocolException($"Count {value} exceeds limit {maxInclusive}.");
            }

            return (int)value;
        }

        public Fixed ReadQuantized(int precisionBits)
        {
            int shift = Fixed.FractionalBits - precisionBits;
            if (shift < 0 || shift > Fixed.FractionalBits)
            {
                throw new ArgumentOutOfRangeException(nameof(precisionBits));
            }

            return Fixed.FromRaw((long)ReadVarInt() << shift);
        }

        public string ReadString(int maxBytes)
        {
            int length = ReadBoundedCount(maxBytes);
            Require(length);
            string value = System.Text.Encoding.UTF8.GetString(_buffer, _position, length);
            _position += length;
            return value;
        }

        /// <summary>Reads an enum stored as one byte and rejects values outside [0, <paramref name="maxDefined"/>].</summary>
        public byte ReadEnumByte(byte maxDefined)
        {
            byte value = ReadByte();
            if (value > maxDefined)
            {
                throw new ProtocolException($"Enum value {value} out of range (max {maxDefined}).");
            }

            return value;
        }

        public void ExpectEnd()
        {
            if (!IsAtEnd)
            {
                throw new ProtocolException($"{Remaining} unexpected trailing bytes.");
            }
        }

        private void Require(int bytes)
        {
            if (bytes < 0 || _position + bytes > _end)
            {
                throw new ProtocolException($"Truncated packet: need {bytes} bytes, {Remaining} remaining.");
            }
        }
    }
}
