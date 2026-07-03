import { redirect } from "next/navigation";

// A antiga página de Cenários foi dividida: eventos de cenário agora vivem no
// Playground (aba "Cenários ativos") e os empréstimos a amigos em /people.
export default function ScenariosRedirect() {
  redirect("/playground");
}
