# EditOnAir - Web-Based Graphics Editor

EditOnAir is a web-based graphics editor, inspired by [Singular.live](https://singular.live), designed for creating and managing on-air graphics for live productions. This project aims to provide a user-friendly interface for designing scenes, adding various objects (text, images, shapes, timers), and controlling their animations and properties via a timeline.

## ✨ Features (Current & Planned)

- **Scene Management**: Create and switch between multiple scenes.
- **Object Manipulation**: 
    - Add various object types: Text, Image, Shape, Timer.
    - Edit object properties (e.g., name, position, size - *position/size editing in progress*).
    - Select objects via timeline or canvas (*canvas selection in progress*).
- **Timeline Control**: 
    - View objects within a selected scene.
    - Set In/Out motion types (e.g., Fade, Slide) for each object.
    - *Keyframe-based animation control is a future goal.*
- **Layout**: Desktop-first, multi-panel interface (Scenes, Object Creation, Canvas, Timeline, Properties).
- **Target Output**: 16:9 aspect ratio canvas, targeting 1920x1080 resolution for broadcast.

## 🛠️ Tech Stack

- **Frontend**: 
    - [React 19](https://react.dev/) (using Vite)
    - [Vite](https://vitejs.dev/) as the build tool
    - [Tailwind CSS](https://tailwindcss.com/) for styling
    - [Lucide React](https://lucide.dev/guide/packages/lucide-react) for icons
    - *(Radix UI planned for accessible UI components)*
- **Backend (Planned)**: 
    - Python (Flask/FastAPI)
    - SQLAlchemy
    - SQLite / PostgreSQL

## 📂 Project Structure (Key Components)

- `src/`
  - `App.jsx`: Main application component, manages global state and layout.
  - `components/`
    - `layout/`
      - `Header.jsx`: Top navigation bar.
      - `Sidebar.jsx`: Left panel for scene listing and selection.
      - `ObjectAddPanel.jsx`: Panel for adding new objects to the selected scene.
      - `CanvasArea.jsx`: Central area for visual scene/object rendering (16:9 aspect ratio).
      - `Timeline.jsx`: Bottom panel for managing scene objects, their timing, and motion properties.
      - `PropertiesPanel.jsx`: Right panel for editing properties of the selected object.
    - `ui/` (Planned for reusable UI elements)
  - `assets/`: Static assets like images or fonts.
  - `main.jsx`: Entry point of the application.

## 🚀 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd graphics-editor
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    # or
    # yarn dev
    ```
    The application will be available at `http://localhost:5173` (or another port if 5173 is busy).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 🔮 Future Roadmap (High-Level)

- Implement actual object rendering and manipulation in `CanvasArea`.
- Develop keyframe animation capabilities in `Timeline`.
- Integrate backend for persistent storage of projects, scenes, and objects.
- Add more object types and properties.
- Implement real-time data linking for dynamic graphics.
- Explore OBS/vMix integration for live output.

---
*This README is actively being updated as the project progresses.*
