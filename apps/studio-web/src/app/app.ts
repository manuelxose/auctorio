import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppConfirmDialogComponent } from './components/ui/app-confirm-dialog.component';
import { AppToastHostComponent } from './components/ui/app-toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppToastHostComponent, AppConfirmDialogComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-host></app-toast-host>
    <app-confirm-dialog></app-confirm-dialog>
  `,
  styleUrl: './app.css',
})
export class App {
}
