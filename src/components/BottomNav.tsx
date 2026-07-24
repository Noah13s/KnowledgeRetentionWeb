import { NavLink } from "react-router-dom";
import './BottomNav.css'
export default function BottomNav() {
    return (
        <nav
            style={{
                bottom: 0,
                left: 0,
                right: 0,
                height: "60px",
                display: "flex",
                borderTop: "1px solid #000000",
                background: "#282a35",
            }}
        >
            <NavLink
                className={({ isActive }) =>
                    isActive ? "nav-link nav-link-active" : "nav-link"
                }
                to="/image"
                style={{ flex: 1, display: "grid", placeItems: "center" }}
            >
                Image Library
            </NavLink>
            <NavLink
                className={({ isActive }) =>
                    isActive ? "nav-link nav-link-active" : "nav-link"
                }
                to="/ai"
                style={{ flex: 1, display: "grid", placeItems: "center" }}
            >
                AI
            </NavLink>
            <NavLink
                className={({ isActive }) =>
                    isActive ? "nav-link nav-link-active" : "nav-link"
                }
                to="/category"
                style={{ flex: 1, display: "grid", placeItems: "center" }}
            >
                Category Editor
            </NavLink>
        </nav>
    );
}