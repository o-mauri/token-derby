export type AchievementToastInput = {
  horseName: string;
  name: string;
  description: string;
  xp: number;
};

export function renderAchievementToast(doc: Document, input: AchievementToastInput): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'achievement-toast';

  const xpCol = doc.createElement('div');
  xpCol.className = 'achievement-toast-xp';
  xpCol.textContent = `+${input.xp} XP`;
  root.appendChild(xpCol);

  const body = doc.createElement('div');
  body.className = 'achievement-toast-body';

  const title = doc.createElement('div');
  title.className = 'achievement-toast-title';
  title.textContent = `${input.horseName} gained ${input.name}`;
  body.appendChild(title);

  const desc = doc.createElement('div');
  desc.className = 'achievement-toast-desc';
  desc.textContent = input.description;
  body.appendChild(desc);

  root.appendChild(body);
  return root;
}
