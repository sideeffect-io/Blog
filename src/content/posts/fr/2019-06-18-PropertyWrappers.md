---
title: Les Property Wrappers de Swift 5.1 — L’implémentation manquante de Published
date: 2019-06-18
description: La WWDC a été formidable cette année. SwiftUI et Combine figuraient parmi les grandes annonces de la conférence. Ils auront un impact considérable sur notre quotidien de développeurs iOS.
tags: langage
image: images/2019-06-18-PropertyWrappers/wrapper.png
lang: fr
---

La WWDC a été formidable cette année. **SwiftUI** et **Combine** figuraient parmi les grandes annonces de la conférence. Ils auront un impact considérable sur notre quotidien de développeurs iOS.

* [**SwiftUI**](https://developer.apple.com/xcode/swiftui/) est le nouveau framework d’Apple permettant de créer nativement des interfaces utilisateur sur toutes les plateformes Apple, de manière déclarative et hautement composable.

* [**Combine**](https://developer.apple.com/documentation/combine) est le nouveau framework déclaratif unifié d’Apple pour traiter des valeurs au fil du temps. C’est une manière détournée de parler de programmation réactive, dont RxSwift et ReactiveCocoa sont les ambassadeurs.

Cet article ne porte pas vraiment sur ces frameworks. Il s’intéresse à une fonctionnalité qui alimente SwiftUI et facilite l’intégration de Combine avec UIKit : les **property wrappers**.

# Les Property Wrappers

Également connu sous le nom de **property delegates**, le mécanisme des property wrappers ne fait pas encore partie du langage Swift — dans sa version 5.0.1 au moment de la rédaction. Il sera disponible avec Swift 5.1. Si vous souhaitez approfondir sa philosophie, consultez la [proposition Swift Evolution SE-0258](https://github.com/apple/swift-evolution/blob/master/proposals/0258-property-delegates.md).

Mon objectif n’est pas de proposer une analyse théorique et exhaustive de la conception et de l’implémentation des **property wrappers**, mais de présenter un cas d’usage concret. Dans la session WWDC « [Combine in Practice](https://developer.apple.com/videos/play/wwdc2019/721) », @Published était présenté comme un moyen de transformer une propriété Swift traditionnelle en **Publisher** Combine. Bien qu’Apple ait présenté ce property wrapper pendant la session, il n’est pas encore disponible dans la première bêta de Swift 5.1. C’est pourquoi il me semble intéressant d’imaginer comment Apple aurait pu l’implémenter.

Avant d’implémenter @Published, voyons comment utiliser les property wrappers.

# Qu’est-ce qu’un property wrapper ?

Un property wrapper est essentiellement une structure de données générique qui encapsule les accès en lecture et en écriture à une propriété, tout en ajoutant un comportement supplémentaire pour « _enrichir_ » sa sémantique.

Implémentons un exemple très simple — voire simpliste. Et si nous voulions empêcher les Optional utilisés dans notre programme d’être nil ?

Nous allons implémenter un **property wrapper** qui force cette propriété à reprendre une valeur par défaut lorsqu’elle devient nil :

![](/images/2019-06-18-PropertyWrappers/1.png)

> Ce property wrapper encapsule l’accès à la propriété : « var value: Value? »

Le compilateur Swift générera une annotation **@ConstrainedOptional** — nommée d’après la structure de property wrapper **ConstrainedOptional** — qui appliquera le comportement spécifié à la variable annotée à chaque mutation.

![](/images/2019-06-18-PropertyWrappers/2.png)

Nous pouvons même ajouter des fonctionnalités au property wrapper lui-même :

![](/images/2019-06-18-PropertyWrappers/3.png)

Nous pouvons ensuite accéder aux fonctionnalités propres au property wrapper en préfixant le nom de la variable avec **$** :

![](/images/2019-06-18-PropertyWrappers/4.png)

Nous accédons ainsi à la valeur du compteur sans avoir à la *force unwrap* — il n’y a évidemment aucune magie derrière cela, le déballage forcé est pris en charge par le property wrapper.

### Utiliser un property wrapper pour gérer la persistance

Comme je l’ai indiqué plus haut, le nom original de property wrapper est **property delegate** — **@propertyDelegate** reste disponible dans Xcode. Cette appellation prend tout son sens lorsqu’il faut informer un acteur tiers qu’une propriété a changé afin qu’il puisse exécuter du code.

Imaginons que nous souhaitions lire ou écrire une valeur dans une base de données à chaque accès ou modification d’une propriété. Une première approche pourrait utiliser une propriété calculée :

![](/images/2019-06-18-PropertyWrappers/5.png)

> CodableDAO est un outil qui abstrait le stockage de toute valeur conforme à Codable.

La nécessité de réécrire ce code pour chaque propriété à persister avec CodableDAO deviendra vite pénible.

Encapsulons-le dans un property wrapper :

![](/images/2019-06-18-PropertyWrappers/6.png)

> Notez qu’il est possible de contraindre le type générique d’un property wrapper à se conformer à un protocole **👌**

Nous pouvons maintenant annoter toute propriété conforme à Codable avec **@Persisted** :

![](/images/2019-06-18-PropertyWrappers/7.png)

Lorsqu’elles sont modifiées, les propriétés **user** et **country** sont persistées de manière transparente. Le property wrapper **@Persisted** prend en charge tout le travail de stockage 👍.

#### Exploiter les property wrappers pour faciliter la conformité à un protocole

Comme nous l’avons vu, les property wrappers peuvent ajouter des comportements ou modifier le stockage sous-jacent d’une propriété.

Nous pouvons les détourner pour atteindre un autre objectif : rendre un type « _presque_ » conforme à un protocole sans avoir recours à une extension.

Swift 5.1 a introduit **Identifiable**. Ce protocole est utilisé dans SwiftUI pour identifier de manière unique les lignes d’un composant List. Sa seule exigence est de fournir une propriété **id**.

Faisons conformer String à ce protocole avec une approche traditionnelle :

![](/images/2019-06-18-PropertyWrappers/8.png)

Malheureusement, comme les extensions ne peuvent pas posséder de propriétés stockées, la valeur **id** sera recalculée à chaque accès.

![](/images/2019-06-18-PropertyWrappers/9.png)

Deux identifiants différents pour une seule et même valeur 😩. Ce n’est pas le comportement attendu pour une donnée Identifiable.

Laissons un property wrapper endosser la responsabilité d’être **_Identifiable_** :

![](/images/2019-06-18-PropertyWrappers/10.png)

> Notez la conformité de UUIDIdentified à Identifiable.

Puisque **id** est une constante du property wrapper, sa valeur ne change pas au fil du temps.

![](/images/2019-06-18-PropertyWrappers/11.png)

Encore une fois, ce n’est pas nécessairement l’usage prévu pour les property wrappers. Ils sont conçus pour agir comme délégués des accès en lecture et en écriture à une valeur encapsulée. Je souhaitais néanmoins partager cette technique afin de recueillir l’avis de la communauté et de montrer qu’un property wrapper peut lui-même se conformer à un protocole si nécessaire.

# Implémenter @Published

Nous comprenons maintenant suffisamment bien les property wrappers pour formuler une hypothèse raisonnable sur l’implémentation d’**@Published** par Apple.

Si le concept de Publisher introduit avec Combine ne vous est pas familier, il est comparable à celui d’Observable dans RxSwift.

Comme expliqué dans la session [Combine in Practice](https://developer.apple.com/videos/play/wwdc2019/721), annoter une propriété avec @Published permet de la transformer en un flux de ses valeurs successives. Ce mécanisme servira notamment à rendre les outlets UIKit compatibles avec les flux Combine.

Dans le ViewController suivant, nous écoutons les mises à jour d’un UITextField. Pour chacune d’elles, nous définissons la valeur d’une propriété String nommée « username » et annotée avec @Published.

Grâce au property wrapper @Published, **$username** devient un Publisher auquel nous pouvons nous abonner.

![](/images/2019-06-18-PropertyWrappers/12.png)

Voici mon implémentation du property wrapper @Published. Chaque fois que la valeur est définie, nous alimentons également un **PassthroughSubject** Combine qui peut ensuite être écouté comme un Publisher.

![](/images/2019-06-18-PropertyWrappers/13.png)

> **Remarque : une implémentation plus courte utilisant CurrentValueSubject est également possible, selon que l’on souhaite ou non toujours récupérer la valeur courante au moment de l’abonnement.**

Puisque Publisher est un protocole, nous pouvons y faire conformer le wrapper en transférant la fonction **receive** au PassthroughSubject interne.

![](/images/2019-06-18-PropertyWrappers/14.png)

Et voilà. Toute propriété annotée avec @Published peut également être considérée comme un Publisher Combine 👍.

# Conclusion

Les property wrappers sont très puissants et peuvent éliminer une grande quantité de code répétitif. C’est une force, mais aussi, malheureusement, un danger.

En abuser ainsi :

![](/images/2019-06-18-PropertyWrappers/15.png)

pourrait rendre le programme incompréhensible, sa logique étant dispersée dans tous les wrappers.

Cela me rappelle les défauts que peut présenter un paradigme comme la [programmation orientée aspect](https://en.wikipedia.org/wiki/Aspect-oriented_programming). D’une certaine manière, les property wrappers peuvent être considérés comme des [aspects](https://en.wikipedia.org/wiki/Aspect_%28computer_programming%29) dans le flux de notre code.

Le temps nous dira comment encadrer leur utilisation. Peut-être les property wrappers devraient-ils être réservés aux frameworks Apple et aux API tierces importantes 🧐.

À l’image des opérateurs personnalisés, ils peuvent être un outil redoutable, mais aussi brouiller les pistes au point que vous ou vos collègues ne compreniez plus votre propre code.

J’ai hâte de voir comment tout cela évoluera dans les prochaines versions bêta de Swift 5.1.

À bientôt.
