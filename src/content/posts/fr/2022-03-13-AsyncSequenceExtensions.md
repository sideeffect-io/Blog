---
title: Des extensions pour AsyncSequence
date: 2022-03-21
description: Swift 5.5 a introduit la concurrence structurée et AsyncSequence, une nouvelle manière de produire un flux de valeurs au fil du temps. Explorons ses différences et ses ressemblances avec Combine, ainsi que des opérateurs familiers.
tags: concurrence
image: images/2022-03-13-AsyncSequenceExtensions/header.jpg
lang: fr
---

# Ce n’est pas Combine, mais…

```swift
let seq1 = AsyncSequence.From([1, 2, 3, 4, 5])
let seq2 = AsyncSequence.From([6, 7, 8, 9, 10])

let currentValue = AsyncStreams.CurrentValue<String>("a")

Task {
    try await AsyncSequences
        .Merge(seq1, seq2)
        .prepend(0)
        .handleEvents(onElement: { print("new integer element \($0)") })
        .withLatestFrom(currentValue)
        .scan("") { accumulator, value in return "\(accumulator) (\(value.0) \(value.1))" }
        .collect { print("new element is collected \($0)") }
}

currentValue.send("b")
currentValue.send(termination: .finished)
```

Au premier regard, nous pourrions croire qu’il s’agit intégralement de code Combine : **Merge**, **prepend**, **handleEvents**, **scan** et même **CurrentValue**. Nous avons l’habitude de rencontrer ces notions dans l’univers de la programmation réactive.

Pourtant, ce n’est pas Combine. Il s’agit à 100 % de concurrence structurée avec **AsyncSequence**, simplement aidée par [AsyncExtensions](https://github.com/AsyncCommunity/AsyncExtensions).
**AsyncExtensions** n’apporte pas seulement des opérateurs proches de Combine à `AsyncSequence`. La bibliothèque fournit également des utilitaires comme **Just**, **Timer** ou **Zip**, ainsi que des équivalents de **Subject** avec **Passthrough**, **CurrentValue** ou **Replay**.

Avant d’explorer certains des opérateurs proposés par **AsyncExtensions**, observons la nature fondamentale de Combine et d’AsyncSequence à l’aide de trois schémas simples.

# Différents et semblables à la fois

## Combine

**Combine**, qui implémente un paradigme de programmation réactive, est un système à la fois **push** et **pull**. Autrement dit, il implémente les patterns **Observer** et **Iterator**.
Pour mieux le comprendre, regardons ce schéma :

![Flux Combine](/images/2022-03-13-AsyncSequenceExtensions/AsyncExtensions1.png)

Un flux **Combine** met en jeu trois acteurs :

* le Publisher produit des valeurs au fil du temps ;
* le Subscriber demande une quantité de valeurs qu’il peut traiter ;
* la Subscription régule le flux de valeurs du Publisher vers le Subscriber.

Pourquoi devons-nous réguler ce flux ? Parce que le Publisher peut produire des valeurs plus vite que le Subscriber ne peut les consommer. Sans régulation, le Subscriber risque d’être submergé par la quantité de travail à traiter, ce qui peut provoquer un état incohérent, voire un crash.
Ce mécanisme s’appelle la **gestion de la contre-pression**. Il impose au Publisher de respecter la demande du Subscriber, éventuellement en empilant les valeurs dans une file d’attente.

**L’idée importante à retenir est qu’un flux Combine est un système push et pull.**

## AsyncSequence

Une **AsyncSequence** est simplement une version asynchrone du protocole **Sequence**. C’est un système **pull**. Autrement dit, elle implémente le pattern **Iterator**.
Pour mieux le comprendre, regardons ce schéma :

![AsyncSequence](/images/2022-03-13-AsyncSequenceExtensions/AsyncExtensions2.png)

L’utilisation d’une **AsyncSequence** met en jeu deux acteurs :

* l’AsyncSequence produit, à la demande, des valeurs au fil du temps ;
* le client demande les valeurs une par une.

Comme il ne s’agit pas d’un mécanisme **push**, l’**AsyncSequence** ne peut produire aucune valeur tant qu’elle n’est pas explicitement sollicitée. Aucun système de régulation n’est nécessaire.
Par conception, une **AsyncSequence** respecte le rythme de son client.

**L’idée importante à retenir est qu’une AsyncSequence est uniquement un système pull.**

## AsyncStream

Il existe une variante particulière d’**AsyncSequence** qui ne respecte pas entièrement la définition précédente. **AsyncStream** est un type d’**AsyncSequence** qui constitue aussi un système **push**.

Pour mieux le comprendre, regardons ce schéma :

![AsyncSequence](/images/2022-03-13-AsyncSequenceExtensions/AsyncExtensions3.png)

L’utilisation d’un **AsyncStream** met en jeu trois acteurs :

* l’AsyncStream produit des valeurs au fil du temps ;
* le client demande les valeurs une par une ;
* la Continuation joue le rôle d’intermédiaire entre l’**AsyncStream** et le client. Elle empile les valeurs et attend que le client les tire.

Pour la même raison qu’un flux **Combine**, un **AsyncStream** a besoin d’un système de régulation. Comme il s’agit à la fois d’un système **push** et **pull**, il lui faut une file d’attente interne pour conserver les valeurs en attendant que son client les consomme.
La principale différence avec un flux **Combine** tient au fait qu’il s’agit toujours d’un système **pull**, valeur par valeur. Le client impose le rythme de sortie des valeurs, comme s’il s’agissait d’un flux **Combine** dont la demande constante serait égale à un.

**L’idée importante à retenir est qu’un AsyncStream est un système push et pull, avec une demande du client limitée à un.**

# Un exemple élémentaire de portage d’un opérateur Combine : scan

**scan** ressemble beaucoup à **reduce**. La seule différence est qu’il émet chaque valeur intermédiaire entre la valeur initiale et la dernière.
Bien qu’assez simple, `scan` n’est actuellement pas fourni comme opérateur d’**AsyncSequence**.

Voici un exemple de son utilisation avec **Combine** :

```swift
[1, 2, 3, 4, 5]
    .publisher
    .scan("") { accumulator, currentValue in
        accumulator + "\(currentValue)"
    }
    .sink(receiveValue: { print($0) })

// will print:
1
12
123
1234
12345
```

À partir de ce constat, nous pouvons déduire le comportement souhaité pour l’équivalent **AsyncSequence** : chaque valeur fournie par son itérateur doit être le résultat d’une closure qui reçoit la valeur précédemment calculée et la prochaine valeur de l’**AsyncSequence** source.

Voici l’**AsyncIterator** qui implémente ce comportement :

```swift
struct AsyncScanIterator<SourceAsyncIterator: AsyncIteratorProtocol, Output>: AsyncIteratorProtocol {
    typealias Element = Output

    var sourceIterator: SourceAsyncIterator
    var currentValue: Element
    let nextPartialResult: (Element, SourceAsyncIterator.Element) async -> Element

    public init(
        sourceIterator: SourceAsyncIterator,
        initialResult: Element,
        nextPartialResult: @escaping (Element, SourceAsyncIterator.Element) async -> Element
    ) {
        self.sourceIterator = sourceIterator
        self.currentValue = initialResult
        self.nextPartialResult = nextPartialResult
    }

    public mutating func next() async rethrows -> Element? {
        guard !Task.isCancelled else { return nil }

        guard let nextSourceValue = try await self.sourceIterator.next() else { return nil }
        self.currentValue = await self.nextPartialResult(self.currentValue, nextSourceValue)
        return self.currentValue
    }
}
```

Voici le code de l’**AsyncScanSequence** qui utilise cet itérateur :

```swift
func scan<Output>(
    _ initialResult: Output,
    _ nextPartialResult: @escaping (Output, Element) async -> Output
) -> AsyncScanSequence<Self, Output> {
    AsyncScanSequence(self, initialResult: initialResult, nextPartialResult: nextPartialResult)
}

struct AsyncScanSequence<UpstreamAsyncSequence: AsyncSequence, Output>: AsyncSequence {
    typealias Element = Output
    typealias AsyncIterator = AsyncScanIterator<UpstreamAsyncSequence.AsyncIterator, Output>

    var upstreamAsyncSequence: UpstreamAsyncSequence
    var initialResult: Output
    let nextPartialResult: (Output, UpstreamAsyncSequence.Element) async -> Output

    init(
        _ upstreamAsyncSequence: UpstreamAsyncSequence,
        initialResult: Output,
        nextPartialResult: @escaping (Output, UpstreamAsyncSequence.Element) async -> Output
    ) {
        self.upstreamAsyncSequence = upstreamAsyncSequence
        self.initialResult = initialResult
        self.nextPartialResult = nextPartialResult
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncScanIterator(
            upstreamIterator: self.upstreamAsyncSequence.makeAsyncIterator(),
            initialResult: self.initialResult,
            nextPartialResult: self.nextPartialResult
        )
    }
}
```

Voici un exemple d’utilisation :

```swift
[1, 2, 3, 4, 5]
    .asyncElements // computed property provided by AsyncExtensions that transforms a sequence in its async counterpart
    .scan("") { accumulator, currentValue in
        accumulator + "\(currentValue)"
    }
    .collect { print($0) } // a function provided by AsyncExtensions that iterates over an async sequence in a functional style

// will print:
1
12
123
1234
12345
```

L’implémentation d’un tel opérateur ne présente aucune difficulté particulière. Un système **pull** convient bien à ce type de sortie linéaire : une valeur à la fois, au rythme du client.

# Moins simple lorsque la chronologie compte : Timer

Essayons de réimplémenter une version **AsyncSequence** de `Timer.publish(every:on:in:)` de **Combine**. Je vois deux manières de procéder : l’une utilise une **AsyncSequence** traditionnelle, l’autre un **AsyncStream**.

Pour les besoins de cette démonstration, nous limiterons le Timer à un intervalle d’une seconde.

## AsyncSequence

```swift
struct AsyncTimerSequence: AsyncSequence {
    typealias AsyncIterator = Iterator
    typealias Element = Date

    func makeAsyncIterator() -> AsyncIterator {
        Iterator()
    }

    struct Iterator: AsyncIteratorProtocol {
        func next() async throws -> Element? {
            guard !Task.isCancelled else { return nil }
            try await Task.sleep(nanoseconds: 1_000_000_000)
            return Date()
        }
    }
}
```

## AsyncStream

```swift
struct AsyncTimerStream: AsyncSequence {
    typealias AsyncIterator = Iterator
    typealias Element = Date

    func makeAsyncIterator() -> AsyncIterator {
        let timerStream = AsyncStream<Date>(Date.self, bufferingPolicy: .unbounded, { continuation in
            Task {
                while !Task.isCancelled {
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                    continuation.yield(Date())
                }
            }
            continuation.finish()
        })
        return timerStream.makeAsyncIterator()
    }
}
```

## Observons leur comportement

Avec **AsyncTimerSequence** :

```swift
let asyncTimerSequence = AsyncTimerSequence()

for try await element in asyncTimerSequence {
    print(element)
}

// will print:
// 2022-03-15 20:00:24 +0000
// 2022-03-15 20:00:25 +0000
// 2022-03-15 20:00:26 +0000
```

Avec **AsyncTimerStream** :

```swift
let asyncTimerStream = AsyncTimerStream()

for try await element in asyncTimerStream {
    print(element)
}

// will print:
// 2022-03-15 20:00:24 +0000
// 2022-03-15 20:00:25 +0000
// 2022-03-15 20:00:26 +0000
```

Jusqu’ici, les deux implémentations se comportent de la même manière et affichent des dates espacées d’une seconde.
Comme nous l’avons vu, une **AsyncSequence** est uniquement un système **pull** : le client impose son rythme. Que se passe-t-il si ce dernier effectue une opération longue entre chaque itération ?

Simulons cela avec un `Task.sleep(nanoseconds: 2_000_000_000)`.

Avec **AsyncTimerSequence** :

```swift
let asyncTimerSequence = AsyncTimerSequence()

for try await element in asyncTimerSequence {
    try await Task.sleep(nanoseconds: 2_000_000_000)
    print(element)
}

// will print:
// 2022-03-15 20:04:24 +0000
// 2022-03-15 20:04:27 +0000
// 2022-03-15 20:04:30 +0000
```

Les dates sont affichées toutes les trois secondes et leurs valeurs sont effectivement espacées de trois secondes : une seconde pour le Timer, plus deux secondes pour chaque itération.

Avec **AsyncTimerStream** :

```swift
let asyncTimerStream = AsyncTimerStream()

for try await element in asyncTimerStream {
    try await Task.sleep(nanoseconds: 2_000_000_000)
    print(element)
}

// will print:
// 2022-03-15 20:04:24 +0000
// 2022-03-15 20:04:25 +0000
// 2022-03-15 20:04:26 +0000
```

Les dates sont affichées toutes les deux secondes, **MAIS** leurs valeurs sont espacées d’une seconde.

Cela vient du fait qu’**AsyncStream** est à la fois un système **push** et **pull**. Une date est poussée toutes les secondes dans la continuation, indépendamment de sa consommation, qui a lieu toutes les deux secondes.

Je ne prétends pas qu’il existe une meilleure manière d’implémenter un Timer, mais il est important de connaître ces différentes stratégies.
Nous pouvons bien sûr atténuer la différence en découplant la consommation des dates de leur création, en encapsulant l’opération longue dans une **Task**.

```swift
for try await element in asyncTimerSequence {
    Task {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        print(element)
    }
}

// or

for try await element in asyncTimerStream {
    Task {
        try await Task.sleep(nanoseconds: 2_000_000_000)
        print(element)
    }
}
```

Avec cette modification, les deux Timers se comportent de la même manière.

# Et les clients concurrents ?

Des clients concurrents parcourent la même **AsyncSequence** depuis plusieurs boucles exécutées en parallèle.
Essayons avec un exemple élémentaire : une **AsyncSequence** qui fournit chaque seconde à ses clients un **compteur** auto-incrémenté.

```swift
struct AsyncCounterSequence: AsyncSequence {
    typealias AsyncIterator = Iterator
    typealias Element = Int

    func makeAsyncIterator() -> AsyncIterator {
        Iterator()
    }

    struct Iterator: AsyncIteratorProtocol {
        var counter = 0

        mutating func next() async throws -> Element? {
            guard !Task.isCancelled else { return nil }
            try await Task.sleep(nanoseconds: 1_000_000_000)
            self.counter += 1
            return counter
        }
    }
}

let asyncCounterSequence = AsyncCounterSequence()

Task {
    for try await counter in asyncCounterSequence {
        print("Task1, counter = \(counter)")
    }
}

Task {
    for try await counter in asyncCounterSequence {
        print("Task2, counter = \(counter)")
    }
}

// will print:
// Task2, counter = 1
// Task1, counter = 1
// Task1, counter = 2
// Task2, counter = 2
// Task1, counter = 3
// Task2, counter = 3
```

Comme prévu, chaque client possède sa propre version indépendante du compteur. Sous le capot, la boucle **`for ... in`** appelle la fonction **`makeAsyncIterator()`**. Deux **Iterators** différents sont produits, chacun avec son propre état **counter**.

Juste pour le plaisir, que se passerait-il si nous voulions partager le même itérateur dans un contexte concurrent ?
Nous devons d’abord en faire un type référence afin qu’il ne soit pas copié lorsqu’il est utilisé depuis deux Tasks différentes.

```swift
class Iterator: AsyncIteratorProtocol {
    var counter = 0

    func next() async throws -> Element? { // removing mutating since this is a class
        guard !Task.isCancelled else { return nil }
        try await Task.sleep(nanoseconds: 1_000_000_000)
        self.counter += 1
        return counter
    }
}
```

Nous devons ensuite utiliser une boucle **while** sur ce même itérateur :

```swift
let asyncCounterSequence = AsyncCounterSequence()
let iterator = asyncCounterSequence.makeAsyncIterator()

Task {
    while let counter = try await iterator.next() {
        print("Task1, counter = \(counter)")
    }
}

Task {
    while let counter = try await iterator.next() {
        print("Task2, counter = \(counter)")
    }
}

// will print:
// Task2, counter = 2
// Task1, counter = 1
// Task1, counter = 4
// Task2, counter = 3
// Task2, counter = 6
// Task1, counter = 5
```

Comme vous pouvez le constater, le résultat n’est pas déterministe puisque la fonction **`next()`** est appelée simultanément. Certains appels sont effectués par la première Task et d’autres par la seconde.

Dans ce cas d’usage artificiel, cela ne pose peut-être aucun problème. **MAIS** que se passe-t-il si une **AsyncSequence** doit réellement être partagée et produire exactement les mêmes résultats pour chaque client ?

Une **AsyncSequence** qui effectue des appels d’API tandis que plusieurs clients traitent les résultats de différentes manières en serait un parfait exemple.

L’**AsyncFetchUsersPagesSequence** suivante récupère des pages de **`[User]`** depuis une fausse API REST à chaque appel de **`next()`** :

```swift
struct AsyncFetchUsersPagesSequence: AsyncSequence {
    typealias AsyncIterator = Iterator
    typealias Element = [User]

    func makeAsyncIterator() -> AsyncIterator {
        Iterator()
    }

    struct Iterator: AsyncIteratorProtocol {
        var page = 1

        mutating func next() async throws -> Element? {
            guard !Task.isCancelled else { return nil }
            guard self.page <= 9 else { return nil }

            let request = URLRequest(url: URL(string: "https://www.server.com/api/users?page=\(self.page)")!)
            let (data, _) = try await URLSession.shared.data(for: request) // no HTTP status code or error check for the sake of simplicity
            self.page += 1
            return try JSONDecoder().decode([User].self, from: data)
        }
    }
}
```

Prenons le cas hypothétique dans lequel nous souhaitons exécuter simultanément deux opérations distinctes sur les résultats, comme les journaliser dans le système de fichiers et les conserver dans une base de données.

```swift
let usersPagesSequence = AsyncFetchUsersPagesSequence()

Task {
    for try await users in usersPagesSequence {
        try await log(users)
    }
}

Task {
    for try await users in usersPagesSequence {
        try await persist(users)
    }
}
```

En parcourant naïvement la séquence ainsi, nous doublons le nombre d’appels à l’API, exactement comme dans l’exemple du **compteur**. Ce n’est pas excellent pour les performances.

Si nous partageons au contraire l’**AsyncIterator** grâce à un type référence, nous obtenons un comportement non déterministe dans lequel certaines pages sont journalisées et d’autres conservées. Ce n’est pas excellent pour… Eh bien, ce n’est tout simplement pas excellent !

Dans l’univers de **Combine**, nous pouvons utiliser l’opérateur **`multicast()`** pour atténuer ce type de problème. Il garantit que le **Publisher** amont ne sera exécuté qu’une seule fois, tout en utilisant un **Subject** pour distribuer les mêmes résultats à tous les **Subscribers**.

[AsyncExtensions](https://github.com/AsyncCommunity/AsyncExtensions) fournit un tel [opérateur](https://github.com/AsyncCommunity/AsyncExtensions/blob/main/Sources/Operators/AsyncSequence%2BMulticast.swift). Pour qu’il fonctionne correctement, j’ai dû développer, à l’aide d’un **Actor**, une forme de régulation qui empêche les accès concurrents à une **AsyncSequence** partagée. Vous trouverez les détails de ce mécanisme de régulation [ici](https://github.com/AsyncCommunity/AsyncExtensions/blob/main/Sources/Internal/ConcurrentAccessRegulator.swift).

Grâce à cela, nous pouvons utiliser **AsyncFetchUsersPagesSequence** sans nous soucier des appels dupliqués ni d’un comportement non déterministe.

```swift
let passthrough = AsyncStreams.Passthrough<[User]>()
let multicastedUsersPagesSequence = AsyncFetchUsersPagesSequence()
    .multicast(passthrough)

Task {
    for try await users in multicastedUsersPagesSequence {
        try await log(users)
    }
}

Task {
    for try await users in multicastedUsersPagesSequence {
        try await persist(users)
    }
}

multicastedUsersPagesSequence.connect() // will unlock the client iterations
```

Les appels à l’API ne sont effectués qu’une seule fois, tandis que la journalisation et la persistance s’exécutent en parallèle sur les mêmes résultats successifs.

# Conclusion

**AsyncSequence** est facile à aborder grâce aux exigences simples de son protocole. Associée à **AsyncStream**, elle peut tout à fait remplacer **Combine** dans certaines situations. N’oublions simplement pas sa nature **pull** et ses limites face à la concurrence. [AsyncExtensions](https://github.com/AsyncCommunity/AsyncExtensions) vise à faciliter l’utilisation de la concurrence structurée dans la plupart des cas, afin que nous n’ayons pas à basculer entre **Combine** et **AsyncSequence**. Certains opérateurs personnalisés peuvent admettre plusieurs implémentations possibles et j’ai essayé de respecter le système **pull** chaque fois que cela était possible. Les commentaires et les pull requests sont bien sûr les bienvenus pour remettre ces implémentations à l’épreuve.

J’espère que cette lecture vous a plu.
À suivre.

Un grand merci à **Ryan F.** pour son excellente relecture.
