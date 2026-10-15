import {
  ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, afterNextRender, computed, inject, Injector, input, model, signal, viewChild,
} from '@angular/core';
import { CdkListbox, CdkOption, type ListboxValueChangeEvent } from '@angular/cdk/listbox';
import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ControlBase } from '../control-base';
import type { TdOption } from '../option';

const OPEN_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', ' ']);
// Drop below the trigger, flipping above it when there isn't room.
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
];

/** Themed dropdown: a trigger button opening a CDK listbox in a CDK overlay. */
@Component({
  selector: 'td-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, CdkListbox, CdkOption],
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class Select<T> extends ControlBase {
  readonly value = model<T | null>(null);
  readonly options = input.required<readonly TdOption<T>[]>();
  readonly placeholder = input('Choose…');
  // Keeps the label for screen readers but hides it, for tight spots like the race header.
  readonly hideLabel = input(false, { transform: booleanAttribute });

  protected readonly open = signal(false);
  protected readonly positions = POSITIONS;
  protected readonly triggerId = `${this.id}-trigger`;
  protected readonly selected = computed<readonly T[]>(() => (this.value() === null ? [] : [this.value()!]));
  protected readonly selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly listbox = viewChild<CdkListbox<T>>(CdkListbox);
  private readonly injector = inject(Injector);

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (this.open() || !OPEN_KEYS.has(event.key)) return;
    event.preventDefault();
    this.show();
  }

  protected dismiss(): void {
    this.close();
  }

  protected onOverlayKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' && event.key !== 'Tab') return;
    if (event.key === 'Escape') event.preventDefault();
    this.close();
  }

  protected choose(event: ListboxValueChangeEvent<T>): void {
    const [next] = event.value;
    if (next !== undefined) this.value.set(next);
    this.close();
  }

  private show(): void {
    if (this.disabled()) return;
    this.open.set(true);
    afterNextRender(() => this.listbox()?.focus(), { injector: this.injector });
  }

  private close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.touch.emit();
    this.trigger().nativeElement.focus();
  }
}
