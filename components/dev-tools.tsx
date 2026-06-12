"use client";

import { useEffect } from "react";

/**
 * Inspetor de Precisão para React 19 + Remote-SSH
 * Extrai a localização exata (Arquivo + Linha) do _debugStack e _debugInfo.
 */
export function DevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const handleClick = (e: MouseEvent) => {
      if (!e.altKey) return;
      
      e.preventDefault();
      e.stopPropagation();

      let target = e.target as HTMLElement | null;
      let source: { fileName: string; lineNumber?: number; columnNumber?: number } | null = null;

      while (target && !source) {
        const fiberKey = Object.keys(target).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let fiber = (target as any)[fiberKey];
          
          while (fiber && !source) {
            if (fiber._debugSource) {
              source = fiber._debugSource;
            } 
            // Estratégia 2: _debugInfo (React 19 Server Components)
            else if (fiber._debugInfo) {
              const infoArray = Array.isArray(fiber._debugInfo) ? fiber._debugInfo : [fiber._debugInfo];
              // O React 19 guarda o stack de criação aqui
              for (const info of infoArray) {
                if (info.stack && info.stack[0]) {
                  // O stack[0] geralmente contém [fileName, line, column] ou um objeto
                  const frame = info.stack[0];
                  if (Array.isArray(frame) && typeof frame[0] === 'string') {
                    source = { fileName: frame[0], lineNumber: frame[1], columnNumber: frame[2] };
                    break;
                  }
                }
              }
            }
            // Estratégia 3: _debugStack (React 19 New Debugging)
            else if (fiber._debugStack) {
              // _debugStack é uma string de erro ou um objeto stack
              const stack = fiber._debugStack;
              const match = stack.match(/at\s+(?:.*?\s+\()?(.*?):(\d+):(\d+)\)?/);
              if (match) {
                source = { fileName: match[1], lineNumber: parseInt(match[2]), columnNumber: parseInt(match[3]) };
              }
            }

            if (source) break;
            fiber = fiber._debugOwner || fiber.return;
          }
        }
        if (source) break;
        target = target.parentElement;
      }

      if (source && source.fileName) {
        let fileName = source.fileName;
        if (fileName.includes('?')) fileName = fileName.split('?')[0];
        
        const remoteHost = process.env.NEXT_PUBLIC_SSH_REMOTE_HOST || "thierry";
        const url = `vscode://vscode-remote/ssh-remote+${remoteHost}${fileName}:${source.lineNumber || 1}:${source.columnNumber || 1}`;
        
        console.log(`%c[DevTools] JSX Encontrado: ${fileName}:${source.lineNumber}`, "color: #f59e0b; font-weight: bold");
        window.location.href = url;
      } else {
        console.warn("[DevTools] Não foi possível encontrar a origem JSX deste elemento. Tente clicar em um componente filho.");
      }
    };

    window.addEventListener("click", handleClick, { capture: true });
    console.log("%c[DevTools] Inspetor de Precisão JSX Ativo (Alt + Clique)", "background: #f59e0b; color: white; padding: 2px 5px; border-radius: 3px;");

    return () => window.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
