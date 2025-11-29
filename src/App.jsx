
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 디바이스 판별 (Safari / Kakao / Chrome 전부 OK)
  const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        로그인 확인 중...
      </div>
    );
  }

  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />

        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* PC / Mobile 자동 분기 */}
        <Route
          path="/app"
          element={
            user ? (
              (isMobileDevice || true) ? (
                <MobileApp role={role} />
              ) : (
                <DispatchApp role={role} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* 나머지는 홈으로 */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Router>
  );
}
// ======================= END =======================