---
title: Un DSL pour les machines à états en Swift
date: 2021-02-13
description: Les machines à états sont prévisibles et testables. Comme elles peuvent être définies de manière abstraite, elles se prêtent bien à un langage dédié. Créons un DSL Swift et utilisons-le dans une architecture en boucle de rétroaction.
tags: architecture, open source, langage
image: images/2021-02-13-StateMachineDSL/header.png
lang: fr
---

# À propos des machines à états

> Une machine à états est une machine abstraite qui ne peut se trouver que dans un seul état parmi un nombre fini d’états à un instant donné. Elle peut passer d’un état à un autre en réponse à des événements externes. Ce changement est appelé une transition. Une machine à états est définie par la liste de ses états, son état initial et les conditions de chaque transition.

Une machine à états est un outil simple, mais puissant, pour construire une fonctionnalité dans une application.

* Elle est prévisible, donc testable.
* Elle constitue une référence que vous pouvez partager avec vos coéquipiers pour raisonner sur une fonctionnalité.
* Elle peut être décrite de manière abstraite, puis implémentée dans n’importe quel langage de programmation.

En tant que développeurs, et plus particulièrement développeurs mobiles, nous devons souvent implémenter des fonctionnalités qui peuvent être résumées par les écrans suivants :

![](/images/2021-02-13-StateMachineDSL/screens.png)

Chaque *état d’écran* doit être exclusif. Nous voulons des écrans cohérents, qui n’affichent qu’un état à la fois. Un écran ne peut pas être à la fois enregistré et en échec.

Pour garantir cela, nous pouvons tirer parti des machines à états finis : elles assurent que deux états ne peuvent pas se chevaucher.

![](/images/2021-02-13-StateMachineDSL/state-machine.png)

Comme vous pouvez le voir, la machine à états correspond exactement à la séquence d’écrans décrite précédemment. Chaque nouvel état est calculé à partir de l’*état courant* et d’une *entrée*, comme une action de l’utilisateur ou le résultat d’un appel réseau.

Ces derniers temps, de nombreuses architectures, principalement unidirectionnelles, tendent à promouvoir des patterns proches des machines à états :

* [MVU/ELM](https://dennisreimann.de/articles/elm-architecture-overview.html) ;
* [Redux](https://redux.js.org/style-guide/style-guide#treat-reducers-as-state-machines) ;
* les boucles de rétroaction : [Feedbacks](https://github.com/CombineCommunity/Feedbacks), [RxFeedback](https://github.com/CombineCommunity/Feedbacks), [Loop](https://github.com/ReactiveCocoa/Loop).

La plupart du temps, elles implémentent leurs machines à états grâce à une fonction **reducer**. Un reducer est une [fonction pure](https://fr.wikipedia.org/wiki/Fonction_pure) qui reçoit l’état courant et un événement, puis produit le nouvel état.

Voici notre machine à états implémentée en pseudo-code :

```swift
reducer(state: State, event: Event) -> State {
  IF state = Loading AND event = LoadingSuccessful RETURN Saving
  IF state = Loading AND event = LoadingFailed RETURN Failed
  IF state = Saving AND event = SavingSuccessful RETURN Saved
  IF state = Saving AND event = SavingFailed RETURN Failed
}
```

# Qu’est-ce qu’un DSL ?

> Sans DSL, le World Wide Web tel que nous le connaissons n’existerait pas !

Un langage dédié, ou Domain-Specific Language — **DSL** —, est un langage informatique spécialisé dans un domaine d’application particulier. **HTML**, par exemple, est un langage de balisage dédié à la description de la mise en page d’un document qui présente des informations. Le domaine du langage HTML contient des concepts comme **HEAD**, **BODY**, **TABLE** ou **IMG**. Ces mots-clés n’ont de sens que dans le contexte de la syntaxe définie par le DSL HTML.

Nous pouvons établir un lien intéressant entre les DSL et les ontologies. Une [ontologie](https://fr.wikipedia.org/wiki/Ontologie_(informatique)) décrit un domaine de connaissances en définissant les concepts qui le constituent et les relations entre eux. Il existe des langages destinés à modéliser les ontologies, comme [RDF](https://fr.wikipedia.org/wiki/Resource_Description_Framework) ou [OWL](https://fr.wikipedia.org/wiki/Web_Ontology_Language). D’une certaine manière, ce sont des méta-DSL : ils offrent des syntaxes génériques pour définir un domaine. Nous pourrions dire qu’un DSL est une implémentation concrète d’une ontologie.

Il existe plusieurs types de DSL :

* les DSL externes, comme HTML, qui nécessitent un interpréteur indépendant pour être exécutés ;
* les DSL internes — ou embarqués —, définis à partir d’un langage hôte. Leur grand avantage tient au fait que le compilateur du langage vérifie que le document respecte à la fois le DSL et la syntaxe du langage hôte. Outre les termes propres au domaine, vous pouvez utiliser les instructions classiques du langage — `if`, `else`, `switch`… — qui influencent dynamiquement son interprétation.

Quelques exemples célèbres de DSL : HTML, Gradle, SQL, SwiftUI et Gherkin.

![](/images/2021-02-13-StateMachineDSL/gherkin.png)
*Voici un test unitaire exprimé avec le DSL Gherkin.*

# Pourquoi des DSL ?

Les DSL permettent aux experts d’un domaine de créer et de partager du contenu sans avoir à affronter la complexité d’un langage de programmation complet.

Un DSL, dont la syntaxe se limite à un domaine précis, peut être modélisé au moyen d’un outil graphique dédié et peut aussi servir à générer du code et de la documentation. Les experts peuvent se concentrer sur leur domaine à un niveau élevé tout en produisant un code source optimisé.

[JetBrains MPS](https://www.jetbrains.com/mps/) est un bon exemple d’outil graphique permettant d’élaborer et d’utiliser des DSL. À partir d’un processus conçu grâce à un DSL, il peut générer du code source dans des langages comme Java, C ou JavaScript. Ce code peut ensuite être intégré à un système d’information d’entreprise afin d’exécuter les processus définis par les experts. Ce type d’outil tente de combler le fossé entre les experts métier et les développeurs.

Les DSL embarqués s’adressent davantage aux développeurs et servent généralement à proposer, au sein de bibliothèques, une syntaxe plus étroite que celle de leur langage hôte.

Nous pouvons, par exemple, imaginer que l’exemple Gherkin précédent soit écrit grâce à un DSL embarqué dans un test unitaire Swift.

```swift
var balance: Int?

Scenario("A user attempts to withdraw more money than they have in their account") {
  Given("John has a valid Credit or Debit card and his balance is 20$") {
    balance = 20
  }

  When("John withdraws 40$") {
    balance -= 40
  }

  Then {
    Error("The ATM displays an error") {
      ATM.Error.notEnoughCredit
    }
    Result("The balance is still 20$") {
      balance == 20
    }
  }
}
```

Sous le capot, ce DSL sera traduit en code lié à `XCTest`.

Pour des langages comme Swift et Kotlin, l’un des avantages des DSL embarqués vient de leurs syntaxes très proches. Il devient plus simple de partager des idées et des implémentations, ainsi que d’effectuer des revues multiplateformes.

# Modéliser des machines à états avec un DSL

Les machines à états reposent sur des concepts assez simples : état, événement, transition. Le DSL résultant devrait donc être assez facile à implémenter, au moins du point de vue de la syntaxe.

L’implémentation d’un DSL de **machine à états finis** peut néanmoins se heurter à quelques difficultés liées au système de types de Swift, car le mot « **fini** » implique de limiter le nombre d’états possibles.

## Les types algébriques

Pour choisir le type approprié afin de modéliser un état, nous devons d’abord comprendre les types algébriques.

En informatique, les types algébriques sont des types de données qui peuvent être composés à partir d’autres types. Ils sont généralement répartis en deux catégories : les types produit et les types somme.

Les **types produit** peuvent contenir plusieurs champs. Le nombre de valeurs différentes de ce type est le produit du nombre de valeurs possibles de chaque champ. En Swift, une **structure** est un type algébrique produit.

```swift
enum Letter {
  case A
  case B
  ...
  case Z
}

enum Number {
  case 1
  case 2
  ...
  case 10
}

struct Reference {
  let letter: Letter
  let number: Number
}

let ref1 = Reference(letter: .A, number: .1)
let ref2 = Reference(letter: .A, number: .2)
...
let ref260 = Reference(letter: .Z, number: .10)
```

Comme vous pouvez le voir, le nombre de valeurs possibles du type **Reference** est égal au produit de toutes les valeurs possibles de ses champs : **26 × 10 = 260**.

Les **types somme**, aussi appelés « unions étiquetées », sont des types qui ne peuvent prendre qu’une valeur à la fois parmi un ensemble fini de valeurs possibles. Le nombre de valeurs différentes est la somme de toutes leurs valeurs exclusives possibles. En Swift, une **énumération** est un type algébrique somme.

```swift
enum Reference {
  case letter(Letter)
  case number(Number)
}

let ref1 = Reference.letter(.A)
let ref2 = Reference.letter(.B)
...
let ref36 = Reference.number(.10)
```

Comme vous pouvez le voir, le nombre de valeurs possibles du type **Reference** est égal à la somme de toutes les valeurs possibles de chaque cas : **26 + 10 = 36**.

## Qu’est-ce que cela implique pour les états ?

Pour implémenter une machine à états finis, nos états doivent former un ensemble fini et être mutuellement exclusifs. En d’autres termes, ils doivent être représentés par des types somme. Voyons pourquoi.

Les types produit sont de mauvais candidats, car ils permettent de mélanger des valeurs incompatibles. Par exemple :

```swift
enum MyError {
  case network
  case database
  case filesystem
}

struct MyState {
  let error: MyError?
  let value: Bool?
}

let state1 = MyState(error: nil, value: nil)
let state2 = MyState(error: nil, value: true)
let state3 = MyState(error: nil, value: false)
let state4 = MyState(error: .network, value: nil)
...
let state12 = MyState(error: .filesystem, value: false)
```

Représenter `MyState` par une structure peut conduire à des comportements incohérents, puisque l’état peut être à la fois une erreur et une valeur valide. Nous obtenons **4 × 3 = 12** états possibles et ambigus.

Les types somme sont, à l’inverse, beaucoup plus restrictifs :

```swift
enum MyState {
  case error(MyError)
  case value(Bool)
}

let state1 = MyState.error(.network)
...
let state5 = MyState.value(false)

```

Représenter `MyState` par une énumération n’autorise que **3 + 2 = 5** états possibles et mutuellement exclusifs.

## Mais les énumérations posent un problème

Lorsque nous concevons un DSL, l’un des principaux objectifs consiste à proposer une syntaxe simple, mais expressive. Nous voulons qu’elle soit aussi proche que possible du langage naturel. Pour définir la transition entre un état **saving** et un état **saved**, nous pourrions vouloir écrire quelque chose comme :

```swift
enum MyState {
  case loading
  case saving(data: Data)
  case saved(data: Data)
  case failed
}

enum MyEvent {
  case loadingSuccessful(data: Data)
  case loadingFailed
  case savingSuccessful(data: Data)
  case savingFailed
}

Transition(from: MyState.saving(let data), on: MyEvent.savingSuccessful, then: { data in
  return MyState.saved(data)
})
```

Le problème est que `MyState.saving(let data)` ne compile même pas : l’extraction d’une valeur embarquée doit avoir lieu dans le contexte d’un pattern matching — `switch` ou `if case let`. Nous pourrions inclure du pattern matching dans le DSL, mais la lecture deviendrait franchement désagréable :

```swift
Transition(
  from: { state in
    guard case let .saving(data) = state else { return nil }
    return data
  },
  on: MyEvent.savingSuccessful,
  then: { extractedData in
    guard let data = extractedData else { return MyState.failed }
    return MyState.saved(data)
  }
)
```

Si je devais utiliser un DSL, je ne voudrais pas de celui-ci.

Nous avons besoin d’un type capable d’embarquer des valeurs tout en fournissant un identifiant unique pour chaque état et chaque événement.

Et si nous utilisions des structures pour modéliser nos états et nos événements, puis leur type comme identifiant unique ? Après tout, les types concrets peuvent être considérés comme mutuellement exclusifs dans l’ensemble des types Swift possibles. Si vous connaissez Kotlin, cela ressemble beaucoup au concept de `sealed class`.

```swift
struct Saving { let data: Data }
struct Saved { let data: Data }

struct SavingSuccessful { let data: Data }

Transition(from: Saving.self, on: SavingSuccessful.self, then: { state, event in
  Saved(data: event.data)
}

// or even shorter:

Transition(from: Saving.self, on: SavingSuccessful.self, then: { Saved(data: $1.data) }
```

C’est nettement mieux.

Mon propos n’est pas d’affirmer qu’un type est meilleur qu’un autre pour modéliser les concepts d’état et d’événement d’une machine à états. Chacun présente des avantages et des inconvénients. [Point-Free a publié une bibliothèque](https://github.com/pointfreeco/swift-case-paths) qui permet, par exemple, de manipuler les valeurs embarquées des énumérations comme des key paths. Les énumérations pourraient ainsi devenir de bonnes candidates pour un DSL de machine à états tout en conservant une syntaxe agréable.

J’ai choisi d’utiliser le type des structures comme identifiant, car il répond aux besoins du DSL sans dépendre d’une bibliothèque tierce. Les structures sont par ailleurs compatibles avec le pattern matching, ce qui sera utile lorsque nous devrons interpréter l’état courant d’un système.

# Result builder

Maintenant que nous avons choisi les types de données qui modéliseront nos états et nos événements, nous pouvons concevoir notre DSL. Il est bien sûr très probable qu’une machine à états comporte plus d’une transition. Elle sera **composée** de plusieurs transitions ou groupes de transitions. Le mot important est ici : **composée**. Dès qu’une entité est composée de plusieurs sous-entités, nous pouvons exploiter le **builder pattern** pour construire l’entité racine.

Si une machine à états déclare trois transitions, par exemple :

```swift
let transitions = Transitions()
  .add(From(Loading.self, on: LoadingSuccessful.self, then: { ... }))
  .add(From(Loading.self, on: LoadingFailure.self, then: { ... }))
  .add(From(Saving.self, on: SavingSuccessful.self, then: { ... }))
  .build()

// or

let transitions = Transitions([
  From(Loading.self, on: LoadingSuccessful.self, then: { ... }),
  From(Loading.self, on: LoadingFailure.self, then: { ... }),
  From(Saving.self, on: SavingSuccessful.self, then: { ... })
])
```

Bien qu’il s’agisse de Swift valide, l’API n’est pas très élégante, surtout dans le contexte d’un DSL.

Dans l’écosystème de programmation Apple, un autre domaine repose fortement sur la composition : les frameworks d’interface, et tout particulièrement SwiftUI. Nous pouvons tirer parti de l’un des mécanismes utilisés par SwiftUI pour composer élégamment les transitions : les [**result builders**](https://github.com/apple/swift-evolution/blob/main/proposals/0289-result-builders.md).

Un **result builder** est, au fond, un moyen d’agréger plusieurs entrées et de calculer un résultat à partir d’elles.

```swift
@resultBuilder
struct StringBuilder {
  static func buildBlock(_ inputs: String...) -> String {
     inputs.joined(separator: "\n")
  }
}

@StringBuilder
var sentence: String {
  "To boldly go"
  "where no one"
  "has gone before"
}

// all the values declared in the `sentence` definition
// will be passed to the `buildBlock` function as separate inputs, and the
// resulting value will be the full sentence:
// "To boldly go
// where no one
// has gone before"
```

Avec ce genre de mécanisme, nous pourrions écrire un `@TransitionBuilder` qui nous permettrait d’écrire :

```swift

struct From {
   // wraps a state id, an event id and the transition to apply
   ...
}

@resultBuilder
struct TransitionBuilder {
  static func buildBlock(_ inputs: From...) -> [From] {
     inputs
  }
}

struct Transitions {
  private let transitions: [From]

  init(@TransitionBuilder _ transitions: () -> [From]) {
    self.transitions = transitions()
  }
}

@TransitionBuilder
var transitions: Transitions {
  From(Loading.self, on: LoadingSuccessful.self, then: { ... })
  From(Loading.self, on: LoadingFailure.self, then: { ... })
  From(Saving.self, on: SavingSuccessful.self, then: { ... })
}

// or something like

let transitions = Transitions {
  From(Loading.self, on: LoadingSuccessful.self, then: { ... })
  From(Loading.self, on: LoadingFailure.self, then: { ... })
  From(Saving.self, on: SavingSuccessful.self, then: { ... })
}
```

# Aperçu d’une implémentation concrète du DSL

Dans le cadre du framework [CombineCommunity Feedbacks](https://github.com/CombineCommunity/Feedbacks), j’ai dû construire un DSL de machine à états destiné à être intégré à la définition d’une boucle de rétroaction.

Voici quelques-uns des concepts que j’ai dû implémenter.

## Les types comme identifiants

Dans une **machine à états**, une transition est identifiée par la paire état courant + événement. Comme indiqué plus haut, j’ai choisi d’utiliser les types des états et des événements pour les identifier. Il me fallait quelques outils pour y parvenir :

```swift
public protocol StaticIdentifiable {
  static var id: AnyHashable { get }
}

public extension StaticIdentifiable {
  static var id: AnyHashable {
    String(reflecting: Self.self)
  }

  var instanceId: AnyHashable {
    Self.id
  }
}

protocol State: StaticIdentifiable {}
protocol Event: StaticIdentifiable {}
```

Comme chaque état et chaque événement se conforme à `StaticIdentifiable`, leurs types peuvent former une paire unique lorsqu’ils sont déclarés dans une transition. Toutes les transitions déclarées peuvent alors être indexées dans un dictionnaire au moyen de cette paire. Le reducer déduit de ces transitions consulte ce dictionnaire pour déterminer la transition à appliquer lorsqu’il reçoit un état et un événement.

## Définir les transitions

Dans notre DSL, une transition est définie par les mots-clés `From` et `On`. La lecture d’une machine à états doit paraître naturelle : « Depuis l’état Loading, lors de l’événement LoadingHasSucceeded, effectuer la transition vers un nouvel état. »

Il doit également être possible de regrouper les transitions qui partent d’un même état afin d’obtenir une syntaxe concise :

```swift
let transitions = Transitions {
  From(Loading.self) { currentState in
    On(LoadingSuccessful.self) { event in
      // compute new state based on currentState and event
    }

    On(LoadingFailure.self, transitionTo: Failed())
  }

  From(Saving.self) { currentState in
    On(SavingSuccessful.self) { event in
      // compute new state based on currentState and event
    }
  }
}
```

Nous disposons ainsi d’un DSL élémentaire pour générer la fonction reducer d’une machine à états. La véritable implémentation du DSL de [CombineCommunity Feedbacks](https://github.com/CombineCommunity/Feedbacks) est très proche de ce que nous voyons ici.

Elle apporte aussi à la syntaxe le concept de **modifiers**, comme SwiftUI. Nous pouvons ainsi écrire :

```swift
let transitions = Transitions {
  From(Saved.self) {
    On(RefreshData.self, transitionsTo: Loading())
  }
  .disable {
    !profile.isSuperUser()
  }
}
```

Le modifier `disable` change dynamiquement le comportement de la transition. Si le profil n’est pas `superUser`, cette transition ne peut jamais être exécutée. La condition de `disable` est évaluée chaque fois que la machine à états rencontre la paire `Saved.self / RefreshData.self`.

## Un exemple d’utilisation

Le dépôt `Feedbacks` contient plusieurs applications qui montrent comment utiliser une machine à états écrite avec un DSL dans un système de boucle de rétroaction.

Le système suivant s’inspire d’un [exemple concret](https://github.com/CombineCommunity/Feedbacks/tree/main/Examples) qui charge les GIF tendance depuis l’**API Giphy** paginée.

```swift
System {
  InitialState {
    Loading(page: 0)
  }

  Feedbacks {
    // the side effect performs the network call when the state is Loading
    Feedback(on: Loading.self, strategy: .cancelOnNewState, perform: loadSideEffect)
  }

  Transitions {
    // Loading transitions
    From(Loading.self) { currentState in
      On(LoadingIsComplete.self) { event in
        Loaded(page: state.page, data: event.payload)
      }

      On(LoadingHasFailed.self, transitionTo: Failed())
    }

    // Loaded transitions
    From(Loaded.self) { currentState in
      On(Refresh.self, transitionTo: Loading(page: currentState.page))
      On(LoadPrevious.self, transitionTo: Loading(page: currentState.page - 1))
      On(LoadNext.self, transitionTo: Loading(page: currentState.page + 1))
    }

    // Failed transitions
    From(Failed.self) {
      On(Refresh.self, transitionTo: Loading(page: 0))
    }
  }
}
```

Pour être tout à fait précis sur le type de machine à états employé par **Feedbacks**, nous pouvons parler d’une [machine de Moore](https://fr.wikipedia.org/wiki/Machine_de_Moore). Si nous considérons les effets de bord comme les sorties de la machine, ils sont déterminés uniquement par l’état courant, tandis qu’une [machine de Mealy](https://fr.wikipedia.org/wiki/Machine_de_Mealy) a besoin d’une paire état + entrée pour produire une sortie.

# Conclusion

Je n’ai rencontré que peu d’implémentations Swift de DSL pour les machines à états, en particulier lorsqu’elles reposent sur les `ResultBuilder`. [Tinder](https://github.com/Tinder/StateMachine) en propose une intéressante en Kotlin. Elle ressemble beaucoup à ce que j’ai conçu, mais utilise une machine de Mealy.

Avec l’introduction officielle des `ResultBuilder` dans Swift 5.4, je suis convaincu que les projets reposant sur des DSL gagneront en popularité sur GitHub et qu’un pattern commun finira peut-être par émerger autour des machines à états.

En attendant, n’hésitez pas à me contacter pour partager vos retours et vos idées sur les machines à états et les DSL.

PS : merci à Helene et Ryan pour leur relecture 👍🏻.
