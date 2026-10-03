using ConflictCore.Client.Logic.Layout;
using UnityEngine;
using NumericsVector2 = System.Numerics.Vector2;

namespace ConflictCore.Client.Layout
{
    /// <summary>
    /// Keeps a full-screen HUD root inside the device safe area (notch, Dynamic Island, rounded corners,
    /// Android navigation/gesture bars). Re-applies when orientation, resolution or safe area changes.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        [SerializeField]
        [Tooltip("Extra inset in pixels so touch targets never hug the bezel.")]
        private float _minimumMarginPixels = 8f;

        private RectTransform? _rect;
        private Rect _appliedSafeArea;
        private Vector2Int _appliedScreen;

        private void Awake()
        {
            _rect = (RectTransform)transform;
            Apply();
        }

        private void Update()
        {
            if (Screen.safeArea != _appliedSafeArea || Screen.width != _appliedScreen.x || Screen.height != _appliedScreen.y)
            {
                Apply();
            }
        }

        private void Apply()
        {
            if (_rect == null)
            {
                return;
            }

            Rect safeArea = Screen.safeArea;
            SafeAreaAnchors anchors = SafeAreaCalculator.Compute(
                new NumericsVector2(Screen.width, Screen.height),
                new NumericsVector2(safeArea.x, safeArea.y),
                new NumericsVector2(safeArea.width, safeArea.height),
                _minimumMarginPixels);

            _rect.anchorMin = new Vector2(anchors.Min.X, anchors.Min.Y);
            _rect.anchorMax = new Vector2(anchors.Max.X, anchors.Max.Y);
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;

            _appliedSafeArea = safeArea;
            _appliedScreen = new Vector2Int(Screen.width, Screen.height);
        }
    }
}
