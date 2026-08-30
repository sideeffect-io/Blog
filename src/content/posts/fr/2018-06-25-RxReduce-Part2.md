---
title: RxReduce — Une architecture réactive de conteneur d’état, partie 2
date: 2018-06-25
description: Après avoir posé les bases des conteneurs d’état, voyons comment RxReduce gère l’état, ses mutations et le travail asynchrone lié aux effets de bord de manière réactive.
tags: architecture, programmation réactive, open source
image: images/2018-06-25-RxReduce-Part2/RxReduce_Logo.png
lang: fr
---

Comme nous l’avons vu dans [RxReduce : une architecture réactive de conteneur d’état, partie 1](/fr/posts/2018-06-24-rxreduce-part1/), l’**état** est une préoccupation centrale des applications. Je vous invite vivement à lire ce premier article. Jusqu’ici, nous n’avons pas introduit le concept de programmation réactive ni vu comment il pouvait résoudre certains problèmes que j’ai rencontrés avec les implémentations traditionnelles de **conteneurs d’état**. Nous allons découvrir comment [RxReduce](https://github.com/RxSwiftCommunity/RxReduce), un framework open source de la RxSwiftCommunity, peut vous aider à gérer l’**état**, ses mutations et le travail asynchrone lié aux effets de bord de manière réactive.

# Les préoccupations

* Le Store utilise le pattern Observer : l’une des responsabilités du **Store** consiste à propager les mutations de l’**état** au reste de l’application. Pour cela, il est courant d’utiliser un pattern **Observer**, afin que les observateurs soient informés des nouvelles valeurs de l’**état**. Dans une approche traditionnelle, les observateurs s’enregistrent et se désenregistrent eux-mêmes auprès du **Store**, ce qui entraîne beaucoup de code répétitif.
* Les effets de bord : dans la [partie 1](/fr/posts/2018-06-24-rxreduce-part1/), nous avons vu que les effets de bord — principalement du travail asynchrone — ne pouvaient pas être gérés par le **Store** ou les **Reducers**. C’est une condition nécessaire à la reproductibilité et à la testabilité de l’**état**. Mais, comme nous le savons tous, les effets de bord sont très courants et même indispensables dans toute application. Utiliser une architecture qui se contente de dire « Hé, vous devriez exécuter les effets de bord en dehors des mutations d’état » peut être assez frustrant et annihiler toute envie de l’adopter.

# RxReduce

[RxReduce](https://github.com/RxSwiftCommunity/RxReduce) est né de mon envie de tester des patterns comme [Redux](https://redux.js.org) dans une application mobile native. J’avais une solide expérience de MVC, MVP et MVVM, mais la gestion de l’**état** éveillait ma curiosité.

L’**état** était évidemment une notion que j’avais déjà dû gérer dans des architectures plus traditionnelles. J’avais fini par exposer mon **modèle** sous forme d’Observables RxSwift depuis des couches de bas niveau, telles que les couches de **services**. C’était un bon début, mais un modèle n’est pas vraiment un état et il se retrouvait dispersé dans tous mes services : pas idéal pour garantir une cohérence globale.

Je devais approfondir ma compréhension de la gestion d’**état**, tout en cherchant à répondre aux préoccupations précédentes sur le pattern Observer et les effets de bord.

[**RxReduce**](https://github.com/RxSwiftCommunity/RxReduce) :

* fournit un **Store** générique capable de gérer toutes sortes d’**états** ;
* expose les mutations de l’**état** au moyen d’un mécanisme réactif ;
* fournit un moyen simple et unifié de faire muter l’**état** de façon synchrone ou asynchrone grâce aux **Actions**.

Dans la suite de cet article, je suppose que vous connaissez les bases de la programmation réactive en général, et de RxSwift en particulier. Si ce n’est pas le cas, vous trouverez de nombreuses ressources excellentes sur le Web 👌.

## La terminologie de RxReduce

Vous pouvez parcourir le dépôt ici : [https://github.com/RxSwiftCommunity/RxReduce](https://github.com/RxSwiftCommunity/RxReduce).

**RxReduce** est compatible avec CocoaPods et Carthage. C’est une toute petite bibliothèque composée de trois protocoles, une classe et deux alias de types :

* **StoreType** : un protocole qui décrit ce que doit être un **Store**. Bien qu’il soit public, vous ne devriez pas avoir besoin d’en fournir votre propre implémentation, car RxReduce propose un **Store** par défaut ;
* **State** : un protocole vide utilisé pour identifier un **état** dans le **Store**. Rien de particulier à implémenter ici ;
* **Action** : un protocole utilisé pour identifier une **Action** dans la fonction de dispatch d’un **Store**. Une seule fonction doit être implémentée, `toAsync()`, mais RxReduce en fournit des implémentations par défaut. Vous n’avez donc rien de particulier à faire ici — les explications arrivent plus loin, dans le chapitre « La conformité conditionnelle est magique » ;
* **Store** : une classe qui représente un **Store** par défaut, capable de dispatcher des **Actions** synchrones ou asynchrones dans des **Reducers** et des **Middlewares**. Un **Store** expose l’**état** après mutation. Vous pouvez avoir plusieurs **Stores** dans votre application, chacun responsable d’un **état** dédié, mais vous devriez envisager un **Store** unique pour simplifier le suivi de l’**état** ;
* **Reducer** : un alias de type pour une fonction pure et générique qui reçoit une **Action** et un **état**, puis renvoie un nouvel **état**. Vous devrez fournir au moins un **Reducer** lors de l’initialisation du **Store**. Il est bien sûr possible d’en ajouter plusieurs afin de séparer les responsabilités. Les **Reducers** sont appliqués les uns après les autres lorsqu’une **Action** est dispatchée au **Store** ;
* **Middleware** : un alias de type pour une fonction pure et générique qui reçoit une **Action** et un **état**, puis ne renvoie… rien. Vous pouvez le voir comme un **Reducer** dépourvu de pouvoir de mutation. Il est appelé avant les **Reducers** lorsqu’une **Action** est dispatchée au **Store**. Les **Middlewares** sont utiles, par exemple, pour la journalisation.

## L’état pilote votre interface

> L’état est le cœur de votre application, par définition ! ([RxReduce : une architecture réactive de conteneur d’état, partie 1](/fr/posts/2018-06-24-rxreduce-part1/))

Une application n’est que le reflet d’un **état** à un instant donné. Dans cette perspective, le titre de ce chapitre ne doit rien au hasard.

RxReduce expose les mutations de l’**état** au monde extérieur, et en particulier à l’interface, au moyen d’un **Driver RxSwift**. Pour rappel, un **Driver** est un Observable qui ne peut pas échouer et qui émet uniquement des événements sur le thread principal. Cela paraît logique pour un **état**.

Écouter les mutations de l’**état** soulève quelques questions fondamentales :

* que se passe-t-il si je ne veux pas être informé d’une mutation qui touche une partie de l’**état** qui ne m’intéresse pas ?
* que se passe-t-il si l’**état** est remplacé par une nouvelle valeur strictement égale ? Le mécanisme de notification va-t-il déclencher des mises à jour inutiles de l’interface ?

Cela mérite une petite explication 😀. Imaginons que notre **état** soit une **structure** représentant :

* l’utilisateur courant de l’application ;
* la liste de ses contacts.

```swift
struct User: Equatable {
    let firstName: String
    let lastName: String
}

struct Contact: Equatable {
    let user: User
    let isConnected: Boolean
}

enum UserState: Equatable {
    case empty
    case loaded (User)
}

enum ContactsState: Equatable {
    case empty
    case loaded ([Contact])
}

struct AppState: State, Equatable {
    var userState: UserState
    var contactsState: ContactsState
}
```

Comme vous pouvez le voir, ces types sont des **types valeur**. C’est une condition nécessaire pour garantir l’immuabilité et la cohérence de l’**état**. Ils sont également **Equatable**. RxReduce peut ainsi déterminer si deux **états** successifs sont identiques et éviter les notifications inutiles. Voilà une réponse à l’une de nos préoccupations 👍.

**AppState** se conforme aussi à **State**. C’est indispensable pour qu’il puisse être géré par le **Store**.

La fonction `dispatch()` suivante appartient au **Store** par défaut fourni par **RxReduce** :

```swift
public func dispatch (action: Action) {
    // every received action is converted to an async action
    action
        .toAsync()
        .map { [unowned self] (action) -> StateType? in
            return self.reducers.reduce(self.state.value, { (state, reducer) -> StateType? in
                return reducer(state, action)
            })
        }.subscribe(onNext: { [unowned self] (newState) in
            self.state.accept(newState)
        }).disposed(by: self.disposeBag)
}
```

Chaque fois que le **Store** reçoit une **Action** :

* l’**Action** est transformée en action asynchrone — voir le chapitre « La conformité conditionnelle est magique » ;
* la liste des **Reducers** enregistrés est appliquée à l’**état** ;
* le nouvel **état** remplace l’ancien.

Voyons deux exemples d’Actions :

```swift
struct LoadUserAction: Action {
    let firstname: String
    let lastname: String
}

struct LoadContactsAction: Action {
    let contacts: [Contact]
}
```

Rien de sorcier… Les **Actions** embarquent simplement ce qui est nécessaire pour faire muter l’**état**, sans aucune logique métier.

Voici deux exemples de **Reducers** :

```swift
func userReducer (state: AppState?, action: Action) -> AppState {

    var currentState = state ?? AppState(userState: UserState.empty,
                                         contactsState: ContactsState.empty)

    // according to the action we create a new state
    switch action {
    case let action as LoadUserAction:
        currentState.userState = UserState.loaded(User(firstname: action.firstname,
                                                       lastname: action.lastname))
        return currentState
    default:
        return currentState
    }
}

func contactsReducer (state: AppState?, action: Action) -> AppState {

    var currentState = state ?? AppState(userState: UserState.empty,
                                         contactsState: ContactsState.empty)

    // according to the action we create a new state
    switch action {
    case let action as LoadContactsAction:
        currentState.contactsState = ContactsState.loaded(action.contacts)
        return currentState
    default:
        return currentState
    }
}
```

Chaque **Reducer** gère les **Actions** qui le concernent. Cela permet de découper les mutations de l’**état** en unités logiques.

## Besoin de vous concentrer sur votre état ? Utilisez les Lenses !

Les **Lenses** sont une technique issue de la programmation fonctionnelle qui répond au problème restant : **« Que se passe-t-il si je ne veux pas être informé d’une mutation qui touche une partie de l’état qui ne m’intéresse pas ? »**

Quelques ressources sur les **Lenses** :

* [Lenses in Swift, par Chris Eidhof](http://chris.eidhof.nl/post/lenses-in-swift/) ;
* [Lenses and Prisms in Swift, par Elviro Rocca](https://broomburgo.github.io/fun-ios/post/lenses-and-prisms-in-swift-a-pragmatic-approach/).

En quelques mots, les Lenses permettent de se concentrer sur une sous-partie d’un type valeur. Comme il s’agit d’une technique de programmation fonctionnelle, elles utilisent une fonction. Essayons avec notre modèle :

```swift
struct Lens<A,B> {
    let from : A -> B
}

let firstname = Lens<Contact, String>(from: { $0.user.firstname })

...

let myContact = Contact(user: User(firstname: "James", lastname: "Kirk"),
                        isConnected: true)

firstname.from(myContact) // will return "James"
```

RxReduce utilise exactement la même technique pour exposer un **état** depuis un **Store**. Il suffit d’appeler la fonction `state()` avec la closure qui se concentre sur le sous-état que vous souhaitez écouter :

```swift
func state<SubState: Equatable>(from: (StateType) -> SubState) -> Driver<SubState> {
    return self.stateSubject
        .asDriver()
        .map { (state) -> SubStateType in
            return from(state)
        }.distinctUntilChanged()
}
```

Cette fonction répond à nos deux problèmes :

* elle ne déclenche pas de nouvel événement si deux **états** consécutifs sont égaux, grâce à `distinctUntilChanged()` ;
* elle évite d’avoir à écouter l’**état** entier.

Bien sûr, vous aurez remarqué que l’**état** est exposé au moyen d’un **Driver** 😀👌 — rappelez-vous : **l’état pilote votre interface**.

Pour information, **RxReduce** fournit également une implémentation sans paramètre de cette fonction. Vous obtenez alors un **Driver** pour l’**état** complet.

Un workflow typique avec RxReduce ressemblerait à ceci :

```swift
// init the Store with the list of the Reducers to apply
let store = Store<AppState>(withReducers: [userReducer, contactsReducer])

...

// listen for the UserState mutations
let userState: Driver<UserState> = store.state { (appState) -> UserState in
    return appState.userState
}

...

// react to the UserState mutations
userState.drive(onNext: { (userState) in
    print ("New userState is \(userState)")
    // update the UI in a Thread safe way
    ...
}).disposed(by: self.disposeBag)

...

// ask the Store to mutate the State
store.dispatch(action: LoadUserAction(firstname: "Tony", lastname: "Stark"))
```

## La conformité conditionnelle est magique

Il nous reste une préoccupation à traiter… les effets de bord.

En programmation fonctionnelle, les effets de bord sont tout ce qui peut faire muter un **état** à l’aide d’entrées-sorties : réseau, persistance, accès aux fichiers… Avec des effets de bord, le résultat d’une fonction peut devenir imprévisible, car il dépend de l’état du système. Lorsqu’une fonction n’a aucun effet de bord, nous pouvons l’exécuter à n’importe quel moment : pour une même entrée, elle renverra toujours le même résultat.

Dans les architectures à flux de données unidirectionnel, nous cherchons à isoler les effets de bord hors du chemin principal : **Vue → Action → Store → Reducer → État → Vue**.

Redux propose une solution : les **Action Creators**. Il s’agit d’un élément qui émet une **Action** et la dispatche au **Store** une fois le travail asynchrone terminé.

Hum, cela me rappelle quelque chose… N’est-ce pas exactement ce qu’est un `Observable<Action>` dans RxSwift ? La fonction `dispatch()` du **Store** ne devrait-elle donc pas recevoir un `Observable<Action>` plutôt qu’une **Action** ?

Eh bien… oui et non ! Elle peut en réalité accepter les deux, car nous voulons parfois une mutation synchrone et parfois une mutation asynchrone.

Qui peut le plus peut le moins. Un travail synchrone n’est qu’un travail asynchrone qui se termine au moment même où il commence 👍. RxReduce fournit un moyen de convertir une action synchrone en action asynchrone :

```swift
public protocol Action {
    func toAsync () -> Observable<Action>
}

extension Action {
    public func toAsync () -> Observable<Action> {
        return Observable<Action>.just(self)
    }
}
```

Très simple. Si vous vous souvenez de l’implémentation de la fonction `dispatch()`, la première chose qu’elle fait est d’appeler `action.toAsync()`… Vous avez maintenant l’explication.

C’est très bien, mais cela ne constitue qu’une partie de la solution. Le **Store** peut ainsi dispatcher des actions synchrones comme si elles étaient asynchrones. Mais qu’en est-il des actions réellement asynchrones ?

Swift 4.1 a récemment introduit la conformité conditionnelle. Si vous ne connaissez pas ce concept, lisez [Un coup d’œil à la conformité conditionnelle](/fr/posts/2018-04-02-glanceatconditionalconformance/).

Elle permet à un type générique de se conformer à un protocole uniquement si le type interne qui lui est associé se conforme lui aussi à ce protocole. Appliquons cela à `Observable` :

```swift
extension Observable: Action where Element == Action {
    public func toAsync () -> Observable<Action> {
        return self.map { $0 as Action }
    }
}
```

Cela signifie qu’un `Observable<Action>` est lui-même une **Action**, mais seulement si son `Element` est une **Action**. Plutôt élégant.

Le Store dispatche donc une **Action**, qu’elle soit synchrone ou asynchrone… de manière transparente.

Le chargement d’un utilisateur ressemblerait en fait à ceci :

```swift
let loadUserAction: Observable<Action> = UserApi.fetchUser(id: 1).map { user in
    return LoadUserAction(user: user)
}

store.dispatch(action: loadUserAction)
```

La conformité conditionnelle est une fonctionnalité très puissante, et nous n’avons même pas besoin d’Action Creators 😀.

## Application de démonstration

Vous trouverez une [application de démonstration complète](https://github.com/RxSwiftCommunity/RxReduce/tree/master/RxReduceDemo) dans le dépôt de RxReduce. Elle combine MVVM et un conteneur d’état.

## Conclusion

Je pense que les **architectures de conteneur d’état** apportent beaucoup à l’ingénierie logicielle mobile. Elles nous obligent à nous demander ce que doit être l’**état** de notre application, comment le faire muter et comment isoler les entrées-sorties. Elles complètent vraiment bien les patterns traditionnels, uniquement orientés vers la vue.

RxReduce exploite la programmation fonctionnelle réactive pour résoudre des problèmes qui pourraient autrement vous rebuter.

Si vous souhaitez en savoir plus sur RxReduce, n’hésitez pas à consulter le [dépôt GitHub](https://github.com/RxSwiftCommunity/RxReduce) et à contribuer 👍.

J’espère que ce sujet vous a plu.

À suivre.
