using System;
using ConflictCore.Core.Numerics;

namespace ConflictCore.Protocol.Serialization
{
    /// <summary>
    /// Allocation-free little-endian writer over a caller-owned buffer. Writers are pooled and reused per
    /// connection; <see cref="Reset"/> rewinds without clearing memory.
    /// </summary>
    public sealed class PacketWriter
    {
        private readonly byte[] _buffer;
        private int _position;

        public PacketWriter(int capacity)
        {
            if (capacity <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(capacity));
            }

            _buffer = new byte[capacity];
        }

        public int Length => _position;

        public int Capacity => _buffer.Length;

        public ArraySegment<byte> Written => new ArraySegment<byte>(_buffer, 0, _position);

        public void Reset() => _position = 0;

        public void WriteByte(byte value)
        {
            EnsureSpace(1);
            _buffer[_position++] = value;
        }

        public void WriteBool(bool value) => WriteByte(value ? (byte)1 : (byte)0);

        public void WriteUInt16(ushort value)
        {
            EnsureSpace(2);
            _buffer[_position++] = (byte)value;
            _buffer[_position++] = (byte)(value >> 8);
        }

        public void WriteUInt32(uint value)
        {
            EnsureSpace(4);
            _buffer[_position++] = (byte)value;
            _buffer[_position++] = (byte)(value >> 8);
            _buffer[_position++] = (byte)(value >> 16);
            _buffer[_position++] = (byte)(value >> 24);
        }

        public void WriteUInt64(ulong value)
        {
            WriteUInt32((uint)value);
            WriteUInt32((uint)(value >> 32));
        }

        /// <summary>LEB128 variable-length unsigned integer: 1 byte for values below 128.</summary>
        public void WriteVarUInt(uint value)
        {
            while (value >= 0x80)
            {
                WriteByte((byte)(value | 0x80));
                value >>= 7;
            }

            WriteByte((byte)value);
        }

        /// <summary>Zig-zag encoded signed varint, so small negative numbers stay small.</summary>
        public void WriteVarInt(int value) => WriteVarUInt((uint)((value << 1) ^ (value >> 31)));

        /// <summary>
        /// Writes a fixed-point value quantised to 1/2^<paramref name="precisionBits"/> units, e.g. 6 bits = 1/64 m
        /// for world positions. Lossy by design; the receiver gets exactly the quantised value.
        /// </summary>
        public void WriteQuantized(Fixed value, int precisionBits)
        {
            int shift = Fixed.FractionalBits - precisionBits;
            if (shift < 0 || shift > Fixed.FractionalBits)
            {
                throw new ArgumentOutOfRangeException(nameof(precisionBits));
            }

            long quantized = value.Raw >> shift;
            if (quantized > int.MaxValue || quantized < int.MinValue)
            {
                throw new ArgumentOutOfRangeException(nameof(value), "Value exceeds quantisation range.");
            }

            WriteVarInt((int)quantized);
        }

        /// <summary>UTF-8 string with a varint length prefix. <paramref name="maxBytes"/> mirrors the reader limit.</summary>
        public void WriteString(string value, int maxBytes)
        {
            int byteCount = System.Text.Encoding.UTF8.GetByteCount(value);
            if (byteCount > maxBytes)
            {
                throw new ArgumentException($"String exceeds {maxBytes} bytes.", nameof(value));
            }

            WriteVarUInt((uint)byteCount);
            EnsureSpace(byteCount);
            _position += System.Text.Encoding.UTF8.GetBytes(value, 0, value.Length, _buffer, _position);
        }

        private void EnsureSpace(int bytes)
        {
            if (_position + bytes > _buffer.Length)
            {
                throw new InvalidOperationException(
                    $"Packet buffer overflow: need {bytes} bytes at {_position}, capacity {_buffer.Length}.");
            }
        }
    }
}
