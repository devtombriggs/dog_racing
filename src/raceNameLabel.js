import { Vector3 } from 'three';

// Project the animated head into the race overlay so text stays upright and
// readable without inheriting a dog's rotation, scale or animation.
export function createRaceNameLabel(container, name, isLocal = false) {
  const element = document.createElement('div');
  element.className = `race-name-label${isLocal ? ' race-name-label--local' : ''}`;
  element.textContent = name;
  element.hidden = true;
  container.appendChild(element);
  const position = new Vector3();

  return {
    update(head, camera) {
      if (!head) {
        element.hidden = true;
        return;
      }
      head.getWorldPosition(position);
      position.y += 0.75;
      position.project(camera);
      const visible = position.z >= -1 && position.z <= 1
        && Math.abs(position.x) <= 1 && Math.abs(position.y) <= 1;
      element.hidden = !visible;
      if (visible) {
        element.style.left = `${(position.x + 1) * 50}%`;
        element.style.top = `${(1 - position.y) * 50}%`;
      }
    },
    dispose() {
      element.remove();
    }
  };
}
