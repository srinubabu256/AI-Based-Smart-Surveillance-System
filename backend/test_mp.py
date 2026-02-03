try:
    import mediapipe as mp
    print(f"Solutions available: {hasattr(mp, 'solutions')}")
    if hasattr(mp, 'solutions'):
        print(f"FaceDetection available: {hasattr(mp.solutions, 'face_detection')}")
except Exception as e:
    print(f"Error: {e}")
