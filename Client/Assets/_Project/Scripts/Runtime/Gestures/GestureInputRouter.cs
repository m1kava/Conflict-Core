using System;
using System.Collections.Generic;
using ConflictCore.Client.Logic.Gestures;
using UnityEngine;

namespace ConflictCore.Client.Gestures
{
    /// <summary>
    /// Single per-frame owner of touch input: reads touches, runs the <see cref="GestureRecognizer"/> and
    /// broadcasts recognised gestures to subscribers (camera rig now; selection and command input in Phase 2).
    /// One router instead of many components polling input keeps ordering explicit and cheap.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GestureInputRouter : MonoBehaviour
    {
        private readonly List<GestureEvent> _events = new List<GestureEvent>(16);
        private UnityTouchReader? _reader;
        private GestureRecognizer? _recognizer;

        public event Action<GestureEvent>? GestureRecognized;

        public GestureSettings Settings { get; } = new GestureSettings();

        private void Awake()
        {
            _reader = new UnityTouchReader();
            _recognizer = new GestureRecognizer(Settings);
            _recognizer.SetScreenDpi(Screen.dpi);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused)
            {
                _recognizer?.Reset();
            }
        }

        private void Update()
        {
            if (_reader == null || _recognizer == null)
            {
                return;
            }

            _events.Clear();
            _recognizer.Process(_reader.Read(), Time.unscaledTime, _events);

            Action<GestureEvent>? handler = GestureRecognized;
            if (handler == null)
            {
                return;
            }

            for (int i = 0; i < _events.Count; i++)
            {
                handler(_events[i]);
            }
        }
    }
}
